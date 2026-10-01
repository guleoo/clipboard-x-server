import { feedbackSpies } from "../support/feedback";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import "../support/dom"
import type { Client } from "../../src/api/client";
import { RequestError } from "../../src/frame/request";
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { ApiProvider } = await import("../../src/api");
const { ConfigurationPage } = await import("../../src/pages/configuration");
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
  expect(feedback.error).toHaveBeenCalledWith("Cleanup interval (minutes) is outside the allowed range")
  expect(updateCleanup).not.toHaveBeenCalled()
  fireEvent.change(interval, { target: { value: "60" } })
  fireEvent.submit(form)
  await waitFor(() => expect(feedback.error).toHaveBeenCalledTimes(2))
  expect(screen.getByRole("alert").textContent).toContain("Cleanup settings are overridden")
  expect((interval as HTMLInputElement).value).toBe("60")
})
