import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import "../support/dom"
const { act, cleanup, fireEvent, render, screen } = await import("@testing-library/react");
const { i18n } = await import("../../src/i18n");
const { usePreferences } = await import("../../src/stores/preferences");
const { LanguageSelector } = await import("../../src/components/domain/language-selector");
const { DisplayPreferences } = await import("../../src/components/domain/display-preferences");
const { formatDate } = await import("../../src/utils/format");
beforeEach(() => {
  localStorage.clear()
  const unsubscribe = usePreferences.getState().initialize()
  unsubscribe()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  usePreferences.setState({ language: "en", offsetMinutes: 0 })
  void i18n.changeLanguage("en")
})

describe("display preferences", () => {
  const midnight = Date.UTC(2026, 0, 1);
  test("defaults to UTC and restores language and offset from browser storage", () => {
    expect(usePreferences.getState().offsetMinutes).toBe(0)
    expect(formatDate(midnight)).toContain("12:00 AM")
    usePreferences.getState().setLanguage("zh-CN")
    usePreferences.getState().setOffset(480)
    usePreferences.setState({ language: "en", offsetMinutes: 0 })
    const unsubscribe = usePreferences.getState().initialize()
    expect(usePreferences.getState()).toMatchObject({ language: "zh-CN", offsetMinutes: 480 })
    expect(i18n.resolvedLanguage).toBe("zh-CN")
    expect(formatDate(midnight)).toContain("08:00")
    unsubscribe()
  })

  test("synchronizes preferences changed in another browser tab", () => {
    const unsubscribe = usePreferences.getState().initialize()
    const value = JSON.stringify({ version: 1, writtenAt: Date.now(), data: { language: "zh-CN", offsetMinutes: -210 } })
    localStorage.setItem("clipboard-x:display-preferences", value)
    window.dispatchEvent(new StorageEvent("storage", { key: "clipboard-x:display-preferences", newValue: value }))
    expect(usePreferences.getState()).toMatchObject({ language: "zh-CN", offsetMinutes: -210 })
    expect(i18n.resolvedLanguage).toBe("zh-CN")
    expect(formatDate(midnight)).toContain("20:30")
    unsubscribe()
  })

  test("switches language through the labelled selector and shows language names before opening", async () => {
    render(<LanguageSelector />)
    const selector = screen.getByRole("combobox", { name: "Language" })
    expect(selector.textContent).toContain("English")
    fireEvent.click(selector)
    const chinese = await screen.findByRole("option", { name: "简体中文" })
    fireEvent.pointerDown(chinese, { pointerType: "mouse" })
    fireEvent.click(chinese)
    expect(screen.getByRole("combobox", { name: "语言" }).textContent).toContain("简体中文")
    expect(usePreferences.getState().language).toBe("zh-CN")
    expect(document.documentElement.lang).toBe("zh-CN")
  })

  test("applies HH:MM offsets immediately and translates validation errors without a save button", async () => {
    render(<DisplayPreferences />)
    const input = screen.getByLabelText("UTC offset") as HTMLInputElement
    expect(input.value).toBe("00:00")
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull()
    fireEvent.change(input, { target: { value: "05:45" } })
    expect(usePreferences.getState().offsetMinutes).toBe(345)
    expect(screen.getByText("Current time offset: UTC+05:45")).toBeTruthy()
    fireEvent.change(input, { target: { value: "14:15" } })
    fireEvent.blur(input)
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByRole("alert").textContent).toContain("−12:00 to +14:00")
    await act(async () => { usePreferences.getState().setLanguage("zh-CN") })
    expect(screen.getByRole("heading", { name: "语言" })).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toContain("−12:00 至 +14:00")
    expect((screen.getByLabelText("UTC 时区偏移") as HTMLInputElement).value).toBe("14:15")
    expect(usePreferences.getState().offsetMinutes).toBe(345)
  })

  test("accepts signed HH:MM boundaries and rejects malformed or unsupported offsets", () => {
    render(<DisplayPreferences />)
    const input = screen.getByLabelText("UTC offset") as HTMLInputElement
    for (const [value, minutes] of [["08:00", 480], ["08:30", 510], ["-05:30", -330], ["-00:15", -15], ["-12:00", -720], ["+14:00", 840]] as const) {
      fireEvent.change(input, { target: { value } })
      fireEvent.blur(input)
      expect(usePreferences.getState().offsetMinutes).toBe(minutes)
      expect(input.getAttribute("aria-invalid")).toBe("false")
      expect(screen.queryByRole("alert")).toBeNull()
    }
    for (const value of ["", "08:", "8", "8.5", "8:30", "08:60", "08:10", "-12:15", "15:00", "08:30junk"]) {
      fireEvent.change(input, { target: { value } })
      fireEvent.blur(input)
      expect(usePreferences.getState().offsetMinutes).toBe(840)
      expect(input.value).toBe(value)
      expect(input.getAttribute("aria-invalid")).toBe("true")
    }
    fireEvent.change(input, { target: { value: "00:00" } })
    expect(usePreferences.getState().offsetMinutes).toBe(0)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  test("updates the offset input when browser preferences change externally", () => {
    render(<DisplayPreferences />)
    const input = screen.getByLabelText("UTC offset") as HTMLInputElement
    fireEvent.change(input, { target: { value: "invalid" } })
    fireEvent.blur(input)
    act(() => usePreferences.getState().setOffset(-330))
    expect(input.value).toBe("-05:30")
    expect(screen.queryByRole("alert")).toBeNull()
  })
});
