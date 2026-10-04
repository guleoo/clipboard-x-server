import { feedbackSpies } from "../support/feedback";
import { afterEach, beforeEach, expect, test } from "bun:test";
import "../support/dom"
import type { Client } from "../../src/api/client";
import { RequestError } from "../../src/frame/request";
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { ApiProvider } = await import("../../src/api");
const { AccountPage } = await import("../../src/pages/account");
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
  await waitFor(() => expect(feedback.error).toHaveBeenCalledWith("You do not have permission to perform this action."))
  expect(screen.getByRole("alert").textContent).toContain("You do not have permission")
  expect((screen.getByLabelText("New password") as HTMLInputElement).value).toBe("new-password")
})
