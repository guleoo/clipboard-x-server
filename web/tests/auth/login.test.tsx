import { feedbackSpies } from "../support/feedback";
import { afterEach, beforeEach, expect, test } from "bun:test";
import "../support/dom"
import type { Client } from "../../src/api/client";
import { RequestError } from "../../src/frame/request";
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { MemoryRouter } = await import("react-router");
const { ApiProvider } = await import("../../src/api");
const { LoginPage } = await import("../../src/pages/login");
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

test("keeps login's inline validation and also shows its localized failure message", async () => {
  const api = { login: async () => { throw new RequestError("business", "invalid credentials", 401, "not_authenticated") } }
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<ApiProvider client={api as unknown as Client}><QueryClientProvider client={query}><MemoryRouter><LoginPage /></MemoryRouter></QueryClientProvider></ApiProvider>)
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "incorrect-password" } })
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }))
  await waitFor(() => expect(feedback.error).toHaveBeenCalledWith("The username or password is incorrect."))
  expect(screen.getByRole("alert").textContent).toContain("The username or password is incorrect.")
})
