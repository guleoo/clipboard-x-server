import { afterEach, expect, mock, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import type { Device } from "../src/api"
import type { Client } from "../src/api/client"

if (!("document" in globalThis)) GlobalRegistrator.register({ url: "http://localhost" })

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { cleanup, fireEvent, render, screen, waitFor, within } = await import("@testing-library/react")
const { ApiProvider } = await import("../src/api")
const { DevicesPage } = await import("../src/pages/devices")

afterEach(cleanup)

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

  const add = await screen.findByRole("button", { name: "添加设备" })
  fireEvent.click(add)

  const dialog = await screen.findByRole("dialog")
  expect(within(dialog).getByLabelText("DeviceId")).toBeTruthy()
  expect(within(dialog).queryByLabelText("设备名称")).toBeNull()
  expect(within(dialog).queryByLabelText("设备图标")).toBeNull()

  fireEvent.change(within(dialog).getByLabelText("DeviceId"), { target: { value: deviceId } })
  fireEvent.click(within(dialog).getByRole("button", { name: "添加设备" }))

  await waitFor(() => expect(createDevice).toHaveBeenCalledWith(deviceId))
})

test("shows each client's configured device icon beside its name", async () => {
  const kinds = ["desktop", "laptop", "phone", "tablet", "server", "other"] as const
  const icons = ["monitor", "laptop", "smartphone", "tablet", "server", "circle-user-round"]
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
    const icon = screen.getByRole("heading", { name: `Device ${index}` }).parentElement?.querySelector("svg")
    expect(icon?.getAttribute("class")).toContain(`lucide-${kind}`)
    expect(icon?.style.getPropertyValue("--device-icon-light")).toBe("#123456")
    expect(icon?.style.getPropertyValue("--device-icon-dark")).toBe("#45abc9")
  }
})
