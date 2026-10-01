import { feedbackSpies } from "../support/feedback";
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import "../support/dom"
import { RequestError } from "../../src/frame/request";
const { act, cleanup, render, renderHook, screen, waitFor } = await import("@testing-library/react");
const { useRefresh } = await import("../../src/components/domain/use-refresh");
const { Toaster } = await import("../../src/frame/components/ui/sonner");
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
  expect(feedback.success).toHaveBeenCalledTimes(1)
  expect(feedback.error).not.toHaveBeenCalled()
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
  expect(feedback.success).not.toHaveBeenCalled()
})

test("does not show late feedback when an in-flight refresh leaves its scope", async () => {
  let finish: ((value: { error: null }) => void) | undefined
  const refresh = mock(() => new Promise<{ error: null }>((resolve) => { finish = resolve }))
  const hook = renderHook(() => useRefresh(refresh, "clipboard"))
  act(() => hook.result.current())
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  hook.unmount()
  await act(async () => { finish!({ error: null }) })
  expect(feedback.success).not.toHaveBeenCalled()
  expect(feedback.error).not.toHaveBeenCalled()
})

test.each([false, true])("shows refresh failure feedback (rejected promise: %s)", async (reject) => {
  const failure = new RequestError("network", "connection failed")
  const refresh = mock(async () => {
    if (reject) throw failure
    return { error: failure }
  })
  const hook = renderHook(() => useRefresh(refresh, "clipboard"))
  act(() => hook.result.current())
  await waitFor(() => expect(feedback.error).toHaveBeenCalledWith("Unable to connect to the server.", expect.any(Object)))
  expect(feedback.success).not.toHaveBeenCalled()
})
