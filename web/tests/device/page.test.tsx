import { feedbackSpies } from "../support/feedback";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import "../support/dom"
import type { Device } from "../../src/api";
import type { Client } from "../../src/api/client";
import { DeviceSchema } from "../../src/api/schemas";
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, cleanup, fireEvent, render, screen, waitFor, within } = await import("@testing-library/react");
const { ApiProvider } = await import("../../src/api");
const { DevicesPage } = await import("../../src/pages/devices");
await import("../../src/i18n")
const { i18n } = await import("../../src/frame/common/i18n");
const feedback = feedbackSpies()

afterEach(cleanup)
beforeEach(async () => { await i18n.changeLanguage("en") })

test("refreshes the device list after debounced clicks and reports success", async () => {
  let devices: Device[] = []
  const api = { devices: mock(async () => devices) }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}><DevicesPage /></QueryClientProvider>
    </ApiProvider>,
  )
  await screen.findByText("No devices yet")
  devices = [{
    id: "device-1", tag: "My laptop", iconKind: "laptop", iconColor: { light: "#ffffff" },
    state: "online", lastSeenAt: 1, createdAt: 1, updatedAt: 1, kind: "client", keys: [],
  }]
  const refresh = screen.getByRole("button", { name: "Refresh" })
  fireEvent.click(refresh)
  fireEvent.click(refresh)
  fireEvent.click(refresh)
  await screen.findByRole("heading", { name: "My laptop" })
  expect(api.devices).toHaveBeenCalledTimes(2)
  await waitFor(() => expect(feedback.success).toHaveBeenCalledWith("Refreshed", expect.anything()))
})

test("hides revoked keys and shows the empty state when refreshed keys are all revoked", async () => {
  let device: Device = {
    id: "device-1", tag: "My laptop", iconKind: "laptop", iconColor: { light: "#ffffff" },
    state: "online", lastSeenAt: 1, createdAt: 1, updatedAt: 1, kind: "client",
    keys: [
      { id: "revoked-key", createdAt: 1, revokedAt: 2 },
      { id: "current-key", createdAt: 3 },
      { id: "overlap-key", createdAt: 2, expiresAt: Date.now() + 300_000 },
    ],
  }
  const api = { devices: mock(async () => [device]) }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}><DevicesPage /></QueryClientProvider>
    </ApiProvider>,
  )
  await screen.findByText("current-key")
  expect(screen.getByText("overlap-key")).toBeTruthy()
  expect(screen.queryByText("revoked-key")).toBeNull()
  expect(screen.getByRole("button", { name: "Rotate key" })).toBeTruthy()
  device = { ...device, keys: device.keys.map((key) => ({ ...key, revokedAt: 4 })) }
  await act(async () => { await query.invalidateQueries({ queryKey: ["devices"] }) })
  await screen.findByText(i18n.t("devices.noKeys", { ns: "management" }))
  expect(screen.queryByText("current-key")).toBeNull()
  expect(screen.queryByText("overlap-key")).toBeNull()
  expect(screen.getByRole("button", { name: "Issue key" })).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Rotate key" })).toBeNull()
  expect(device.keys).toHaveLength(3)
})

test("registers the client DeviceId without asking the administrator for client-owned profile fields", async () => {
  const deviceId = "123e4567-e89b-42d3-a456-426614174000"
  const created: Device = {
    id: deviceId,
    tag: "Waiting for device profile",
    iconKind: "other",
    iconColor: { light: "#ffffff" },
    state: "offline",
    lastSeenAt: 0,
    createdAt: 1,
    updatedAt: 1,
    kind: "client",
    keys: [],
  }
  const createDevice = mock(async () => created)
  const api = {
    devices: mock(async () => []),
    createDevice,
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}>
        <DevicesPage />
      </QueryClientProvider>
    </ApiProvider>,
  )

  const add = await screen.findByRole("button", { name: "Add device" })
  fireEvent.click(add)

  const dialog = await screen.findByRole("dialog")
  expect(within(dialog).getByLabelText("DeviceId")).toBeTruthy()
  expect(within(dialog).queryByLabelText("Device name")).toBeNull()
  expect(within(dialog).queryByLabelText("Device icon")).toBeNull()

  fireEvent.change(within(dialog).getByLabelText("DeviceId"), { target: { value: deviceId } })
  fireEvent.click(within(dialog).getByRole("button", { name: "Add device" }))

  await waitFor(() => expect(createDevice).toHaveBeenCalledWith(deviceId))
})

test("updates an open device dialog when the language changes without losing the DeviceId", async () => {
  const api = { devices: mock(async () => []), createDevice: mock(async () => ({})) }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}><DevicesPage /></QueryClientProvider>
    </ApiProvider>,
  )
  fireEvent.click(await screen.findByRole("button", { name: "Add device" }))
  const dialog = await screen.findByRole("dialog")
  const deviceId = "123e4567-e89b-42d3-a456-426614174000"
  fireEvent.change(within(dialog).getByLabelText("DeviceId"), { target: { value: deviceId } })
  await act(async () => { await i18n.changeLanguage("zh-CN") })
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "添加设备" })).toBeTruthy())
  expect((within(dialog).getByLabelText("DeviceId") as HTMLInputElement).value).toBe(deviceId)
})

test("shows each client's configured device icon beside its name", async () => {
  const kinds = ["computer", "laptop", "tablet", "server", "android", "apple", "windows",
    "linux", "debian", "archlinux", "unknown-os", "__proto__"] as const
  const icons = ["computer", "laptop", "tablet", "server", "android-fill", "apple-fill",
    "windows-fill", "linux", "debian", "archlinux", "computer", "computer"]
  const devices: Device[] = kinds.map((iconKind, index) => ({
    id: `device-${index}`,
    tag: `Device ${index}`,
    iconKind,
    iconColor: { light: "#45abc9", dark: "#123456" },
    state: "offline",
    lastSeenAt: 0,
    createdAt: 1,
    updatedAt: 1,
    kind: "client",
    keys: [],
  }))
  expect(DeviceSchema.parse(devices[9]).iconKind).toBe("archlinux")
  expect(DeviceSchema.parse(devices[10]).iconKind).toBe("unknown-os")
  const api = { devices: mock(async () => devices) }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}>
        <DevicesPage />
      </QueryClientProvider>
    </ApiProvider>,
  )

  await screen.findByRole("heading", { name: "Device 0" })
  for (const [index, kind] of icons.entries()) {
    const icon = screen.getByRole("heading", { name: `Device ${index}` }).parentElement
      ?.querySelector<HTMLSpanElement>("span[aria-hidden]")
    expect(icon?.style.maskImage).toContain(`/icons/device/${kind}-symbolic.svg`)
    expect(icon?.style.getPropertyValue("--device-icon-light")).toBe("#123456")
    expect(icon?.style.getPropertyValue("--device-icon-dark")).toBe("#45abc9")
  }
})

test("localizes the newly registered device's waiting state and keeps client names unchanged", async () => {
  const waiting: Device = {
    id: "device-waiting", tag: "Waiting for device profile", kind: "client",
    iconKind: "other", iconColor: { light: "#ffffff" }, state: "offline",
    lastSeenAt: 0, createdAt: 1, updatedAt: 1, keys: [],
  }
  const named = { ...waiting, id: "device-named", tag: "My laptop" }
  const connected = { ...waiting, id: "device-connected", lastSeenAt: 10 }
  let devices = [waiting, named, connected]
  const api = { devices: mock(async () => devices) }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <ApiProvider client={api as unknown as Client}>
      <QueryClientProvider client={query}><DevicesPage /></QueryClientProvider>
    </ApiProvider>,
  )
  await screen.findByRole("heading", { name: "Waiting for device connection" })
  await act(async () => { await i18n.changeLanguage("zh-CN") })
  expect(screen.getByRole("heading", { name: "等待设备连接" })).toBeTruthy()
  expect(screen.getByRole("heading", { name: "My laptop" })).toBeTruthy()
  expect(screen.getByRole("heading", { name: "Waiting for device profile" })).toBeTruthy()
  expect(waiting.tag).toBe("Waiting for device profile")
  devices = [{ ...waiting, tag: "我的电脑", lastSeenAt: 10 }, named, connected]
  await act(async () => { await query.invalidateQueries({ queryKey: ["devices"] }) })
  await screen.findByRole("heading", { name: "我的电脑" })
  expect(screen.queryByRole("heading", { name: "等待设备连接" })).toBeNull()
})
