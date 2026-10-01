import { feedbackSpies } from "../support/feedback";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import "../support/dom"
import type { Client } from "../../src/api/client";
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { ApiProvider } = await import("../../src/api");
const { TransfersPage } = await import("../../src/pages/transfers");
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
  await waitFor(() => expect(feedback.success).toHaveBeenCalledWith("Refreshed", expect.any(Object)))
  expect(transfers).toHaveBeenCalledTimes(2)
})
