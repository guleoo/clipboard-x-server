import { feedbackSpies } from "../support/feedback";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import "../support/dom"
import type { Client } from "../../src/api/client";
import { RequestError } from "../../src/frame/request";
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { MemoryRouter } = await import("react-router");
const { ApiProvider } = await import("../../src/api");
const { NormalLayout } = await import("../../src/layout/normal");
const { useTheme } = await import("../../src/stores/theme");
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
    expect(feedback.success).toHaveBeenCalledWith("Switched to dark theme")
    fireEvent.click(screen.getByRole("button", { name: "Open settings menu" }))
    const chinese = await screen.findByRole("menuitemradio", { name: "简体中文" })
    fireEvent.pointerDown(chinese, { pointerType: "mouse" })
    fireEvent.click(chinese)
    await waitFor(() => expect(feedback.success).toHaveBeenCalledWith("语言已更新"))
    const settings = screen.getByRole("button", { name: "打开设置菜单" })
    if (settings.getAttribute("aria-expanded") !== "true") fireEvent.click(settings)
    const signOut = await screen.findByRole("menuitem", { name: "退出登录" })
    fireEvent.pointerDown(signOut, { pointerType: "mouse" })
    fireEvent.click(signOut)
    await waitFor(() => expect(feedback.error).toHaveBeenCalledWith("无法连接服务器。"))
    expect(useAuth.getState().authenticated).toBe(true)
    expect(feedback.success.mock.calls.some((call) => call[0] === "已退出登录")).toBe(false)
  } finally {
    cleanup()
    useTheme.getState().set(previousTheme)
  }
})
