import { feedbackSpies } from "../support/feedback";
import { afterEach, beforeEach, expect, test } from "bun:test";
import "../support/dom"
const { act, cleanup, fireEvent, render, screen } = await import("@testing-library/react");
const { DisplayPreferences } = await import("../../src/components/domain/display-preferences");
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

test("shows language and offset messages only for actual valid user changes", async () => {
  render(<><DisplayPreferences /><Toaster /></>)
  expect(feedback.success).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole("combobox", { name: "Language" }))
  const chinese = await screen.findByRole("option", { name: "简体中文" })
  fireEvent.pointerDown(chinese, { pointerType: "mouse" })
  fireEvent.click(chinese)
  await screen.findByText("语言已更新")
  expect(feedback.success).toHaveBeenCalledTimes(1)
  const input = screen.getByLabelText("UTC 时区偏移")
  fireEvent.change(input, { target: { value: "08:30" } })
  await screen.findByText("时区偏移已更新为 UTC+08:30")
  expect(feedback.success).toHaveBeenCalledTimes(2)
  fireEvent.change(input, { target: { value: "+08:30" } })
  fireEvent.change(input, { target: { value: "08:60" } })
  fireEvent.blur(input)
  expect(feedback.success).toHaveBeenCalledTimes(2)
  expect(usePreferences.getState().offsetMinutes).toBe(510)
  act(() => { const unsubscribe = usePreferences.getState().initialize(); unsubscribe() })
  expect(feedback.success).toHaveBeenCalledTimes(2)
})
