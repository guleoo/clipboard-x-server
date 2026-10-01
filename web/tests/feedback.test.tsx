import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { toast } from "sonner"
import type { Client } from "../src/api/client"
import { RequestError } from "../src/frame/request"

if (!("document" in globalThis)) GlobalRegistrator.register({ url: "http://localhost" })

const { act, cleanup, fireEvent, render, renderHook, screen, waitFor } = await import("@testing-library/react")
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query")
const { MemoryRouter } = await import("react-router")
const { ApiProvider } = await import("../src/api")
const { useRefresh } = await import("../src/components/domain/use-refresh")
const { DisplayPreferences } = await import("../src/components/domain/display-preferences")
const { Toaster } = await import("../src/frame/components/ui/sonner")
const { DevicesPage } = await import("../src/pages/devices")
const { LoginPage } = await import("../src/pages/login")
const { TransfersPage } = await import("../src/pages/transfers")
const { ConfigurationPage } = await import("../src/pages/configuration")
const { AccountPage } = await import("../src/pages/account")
const { NormalLayout } = await import("../src/layout/normal")
const { useTheme } = await import("../src/stores/theme")
const { usePreferences } = await import("../src/stores/preferences")
const { useAuth } = await import("../src/stores/auth")
const { i18n } = await import("../src/i18n")

let success: ReturnType<typeof spyOn<typeof toast, "success">>
let error: ReturnType<typeof spyOn<typeof toast, "error">>
beforeEach(async () => {
  toast.dismiss()
  usePreferences.setState({ language: "en", offsetMinutes: 0 })
  useAuth.getState().clear()
  await i18n.changeLanguage("en")
  success = spyOn(toast, "success")
  error = spyOn(toast, "error")
})
afterEach(() => {
  cleanup()
  success.mockRestore()
  error.mockRestore()
  toast.dismiss()
  localStorage.clear()
  usePreferences.setState({ language: "en", offsetMinutes: 0 })
  useAuth.getState().clear()
})

const delay = (millis: number) => new Promise<void>((resolve) => setTimeout(resolve, millis))

test("debounces refresh clicks and replaces the loading message with a success popup", async () => {
  let finish: ((value: { error: null }) => void) | undefined
  const refresh = mock(() => new Promise<{ error: null }>((resolve) => { finish = resolve }))
  const hook = renderHook(() => useRefresh(refresh, "clipboard"))
  render(<Toaster />)
  act(() => hook.result.current())
  await screen.findByText("Refreshing…")
  await act(() => delay(160))
  act(() => hook.result.current())
  await act(() => delay(160))
  expect(refresh).not.toHaveBeenCalled()
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  act(() => hook.result.current())
  expect(refresh).toHaveBeenCalledTimes(1)
  await act(async () => { finish!({ error: null }) })
  await screen.findByText("Refreshed")
  expect(success).toHaveBeenCalledTimes(1)
  expect(error).not.toHaveBeenCalled()
})

test("cancels queued refreshes on scope changes and unmount", async () => {
  const refresh = mock(async () => ({ error: null }))
  const hook = renderHook(({ scope }) => useRefresh(refresh, scope), { initialProps: { scope: "channel-a" } })
  act(() => hook.result.current())
  hook.rerender({ scope: "channel-b" })
  await act(() => delay(350))
  expect(refresh).not.toHaveBeenCalled()
  act(() => hook.result.current())
  hook.unmount()
  await act(() => delay(350))
  expect(refresh).not.toHaveBeenCalled()
  expect(success).not.toHaveBeenCalled()
})

test("does not show late feedback when an in-flight refresh leaves its scope", async () => {
  let finish: ((value: { error: null }) => void) | undefined
  const refresh = mock(() => new Promise<{ error: null }>((resolve) => { finish = resolve }))
  const hook = renderHook(() => useRefresh(refresh, "clipboard"))
  act(() => hook.result.current())
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  hook.unmount()
  await act(async () => { finish!({ error: null }) })
  expect(success).not.toHaveBeenCalled()
  expect(error).not.toHaveBeenCalled()
})

test.each([false, true])("shows refresh failure feedback (rejected promise: %s)", async (reject) => {
  const failure = new RequestError("network", "connection failed")
  const refresh = mock(async () => {
    if (reject) throw failure
    return { error: failure }
  })
  const hook = renderHook(() => useRefresh(refresh, "clipboard"))
  act(() => hook.result.current())
  await waitFor(() => expect(error).toHaveBeenCalledWith("Unable to connect to the server.", expect.any(Object)))
  expect(success).not.toHaveBeenCalled()
})

test("shows language and offset messages only for actual valid user changes", async () => {
  render(<><DisplayPreferences /><Toaster /></>)
  expect(success).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("combobox", { name: "Language" }))
  const chinese = await screen.findByRole("option", { name: "简体中文" })
  fireEvent.pointerDown(chinese, { pointerType: "mouse" })
  fireEvent.click(chinese)
  await screen.findByText("语言已更新")
  expect(success).toHaveBeenCalledTimes(1)
  const input = screen.getByLabelText("UTC 时区偏移")
  fireEvent.change(input, { target: { value: "08:30" } })
  await screen.findByText("时区偏移已更新为 UTC+08:30")
  expect(success).toHaveBeenCalledTimes(2)
  fireEvent.change(input, { target: { value: "+08:30" } })
  fireEvent.change(input, { target: { value: "08:60" } })
  fireEvent.blur(input)
  expect(success).toHaveBeenCalledTimes(2)
  expect(usePreferences.getState().offsetMinutes).toBe(510)
  act(() => { const unsubscribe = usePreferences.getState().initialize(); unsubscribe() })
  expect(success).toHaveBeenCalledTimes(2)
})

test("reports a denied API key copy without showing a false success", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard")
  const writeText = mock(async () => { throw new Error("Permission denied") })
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  try {
    const api = {
      devices: async () => [{
        id: "device-1", tag: "Laptop", iconKind: "laptop", iconColor: { light: "#ffffff" },
        state: "offline", lastSeenAt: 1, createdAt: 1, updatedAt: 1, kind: "client", keys: [],
      }],
      issueDeviceKey: async () => ({ id: "key-1", key: "cbx_full_device_key", createdAt: 1 }),
    }
    const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<ApiProvider client={api as unknown as Client}><QueryClientProvider client={query}><DevicesPage /></QueryClientProvider></ApiProvider>)
    fireEvent.click(await screen.findByRole("button", { name: "Issue key" }))
    fireEvent.click(await screen.findByRole("button", { name: "Copy key" }))
    await waitFor(() => expect(error).toHaveBeenCalledWith("Unable to copy the API key. Check your browser's clipboard permissions."))
    expect(writeText).toHaveBeenCalledWith("cbx_full_device_key")
    expect(success).not.toHaveBeenCalled()
  } finally {
    if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor)
    else Reflect.deleteProperty(navigator, "clipboard")
  }
})

test("keeps login's inline validation and also shows its localized failure message", async () => {
  const api = { login: async () => { throw new RequestError("business", "invalid credentials", 401, "not_authenticated") } }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<ApiProvider client={api as unknown as Client}><QueryClientProvider client={query}><MemoryRouter><LoginPage /></MemoryRouter></QueryClientProvider></ApiProvider>)
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "incorrect-password" } })
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
  await waitFor(() => expect(error).toHaveBeenCalledWith("The username or password is incorrect."))
  expect(screen.getByRole("alert").textContent).toContain("The username or password is incorrect.")
})

test("activity refresh also coalesces clicks and reports success", async () => {
  const transfers = mock(async () => [])
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<ApiProvider client={{ transfers } as unknown as Client}><QueryClientProvider client={query}><TransfersPage /></QueryClientProvider></ApiProvider>)
  await screen.findByText("No transfers yet")
  const button = screen.getByRole("button", { name: "Refresh" })
  fireEvent.click(button)
  fireEvent.click(button)
  fireEvent.click(button)
  expect(transfers).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(success).toHaveBeenCalledWith("Refreshed", expect.any(Object)))
  expect(transfers).toHaveBeenCalledTimes(2)
})

test("cleanup submission reports validation and server failures while preserving the form", async () => {
  const updateCleanup = mock(async () => { throw new RequestError("business", "source overridden", 409, "configuration_conflict") })
  const api = { configuration: {
    getCleanup: async () => ({ enabled: false, intervalMillis: 3_600_000, clipboard: {} }),
    updateCleanup,
  } }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<ApiProvider client={api as unknown as Client}><QueryClientProvider client={query}><ConfigurationPage /></QueryClientProvider></ApiProvider>)
  const interval = await screen.findByLabelText("Cleanup interval (minutes)")
  const form = screen.getByRole("button", { name: "Save cleanup policy" }).closest("form")!
  fireEvent.change(interval, { target: { value: "0.5" } })
  fireEvent.submit(form)
  expect(error).toHaveBeenCalledWith("Cleanup interval (minutes) is outside the allowed range")
  expect(updateCleanup).not.toHaveBeenCalled()
  fireEvent.change(interval, { target: { value: "60" } })
  fireEvent.submit(form)
  await waitFor(() => expect(error).toHaveBeenCalledTimes(2))
  expect(screen.getByRole("alert").textContent).toContain("Cleanup settings are overridden")
  expect((interval as HTMLInputElement).value).toBe("60")
})

test("account updates report failure and retain the entered credentials", async () => {
  const api = {
    session: async () => ({ administrator: { id: 1, username: "admin", createdAt: 1 } }),
    updateAdministrator: async () => { throw new RequestError("business", "denied", 403, "not_authorized") },
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<ApiProvider client={api as unknown as Client}><QueryClientProvider client={query}><AccountPage /></QueryClientProvider></ApiProvider>)
  await waitFor(() => expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("admin"))
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password" } })
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "new-password" } })
  fireEvent.click(screen.getByRole("button", { name: "Update administrator" }))
  await waitFor(() => expect(error).toHaveBeenCalledWith("You do not have permission to perform this action."))
  expect(screen.getByRole("alert").textContent).toContain("You do not have permission")
  expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("new-password")
})

test("settings menu language and theme changes report success and failed sign-out reports failure", async () => {
  const previousTheme = useTheme.getState().preference
  useTheme.getState().set("light")
  const api = {
    session: async () => ({ administrator: { id: 1, username: "admin", createdAt: 1 } }),
    logout: mock(async () => { throw new RequestError("network", "offline") }),
  }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    render(<ApiProvider client={api as unknown as Client}><QueryClientProvider client={query}><MemoryRouter><NormalLayout /></MemoryRouter></QueryClientProvider></ApiProvider>)
    fireEvent.click(await screen.findByRole("button", { name: "Switch between light and dark themes" }))
    expect(success).toHaveBeenCalledWith("Switched to dark theme")
    fireEvent.click(screen.getByRole("button", { name: "Open settings menu" }))
    const chinese = await screen.findByRole("menuitemradio", { name: "简体中文" })
    fireEvent.pointerDown(chinese, { pointerType: "mouse" })
    fireEvent.click(chinese)
    await waitFor(() => expect(success).toHaveBeenCalledWith("语言已更新"))
    const settings = screen.getByRole("button", { name: "打开设置菜单" })
    if (settings.getAttribute("aria-expanded") !== "true") fireEvent.click(settings)
    const signOut = await screen.findByRole("menuitem", { name: "退出登录" })
    fireEvent.pointerDown(signOut, { pointerType: "mouse" })
    fireEvent.click(signOut)
    await waitFor(() => expect(error).toHaveBeenCalledWith("无法连接服务器。"))
    expect(useAuth.getState().authenticated).toBe(true)
    expect(success.mock.calls.some((call) => call[0] === "已退出登录")).toBe(false)
  } finally {
    cleanup()
    useTheme.getState().set(previousTheme)
  }
})
