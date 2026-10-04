import { feedbackSpies } from "../support/feedback";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import "../support/dom"
import type { Client } from "../../src/api/client";
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { ApiProvider } = await import("../../src/api");
const { DevicesPage } = await import("../../src/pages/devices");
const { usePreferences } = await import("../../src/stores/preferences");
const { useAuth } = await import("../../src/stores/auth");
const { i18n } = await import("../../src/i18n");
const feedback = feedbackSpies()
beforeEach(async () => {
  usePreferences.setState({ language: "en", offsetMinutes: 0 })
  useAuth.getState().clear()
  await i18n.changeLanguage("en")
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  usePreferences.setState({ language: "en", offsetMinutes: 0 })
  useAuth.getState().clear()
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
    await waitFor(() => expect(feedback.error).toHaveBeenCalledWith("Unable to copy the API key. Check your browser's clipboard permissions."))
    expect(writeText).toHaveBeenCalledWith("cbx_full_device_key")
    expect(feedback.success).not.toHaveBeenCalled()
  } finally {
    if (descriptor) Object.defineProperty(navigator, "clipboard", descriptor)
    else Reflect.deleteProperty(navigator, "clipboard")
  }
})
