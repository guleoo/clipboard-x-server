import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import "../support/dom"
import { DateTime } from "../../src/frame/common/date";
const { cleanup } = await import("@testing-library/react");
const { i18n } = await import("../../src/i18n");
const { usePreferences } = await import("../../src/stores/preferences");
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

describe("UTC offset formatting", () => {
  const midnight = Date.UTC(2026, 0, 1);
  test("handles positive, negative and fractional offsets with date rollover", () => {
    expect(DateTime.format(midnight, { offsetMinutes: 480 })).toContain("8:00 AM")
    expect(DateTime.format(midnight, { offsetMinutes: -330 })).toContain("Dec 31, 2025")
    expect(DateTime.format(midnight, { offsetMinutes: -330 })).toContain("6:30 PM")
    expect(DateTime.format(midnight, { offsetMinutes: 345 })).toContain("5:45 AM")
    expect(DateTime.offsetLabel(345)).toBe("UTC+05:45")
    expect(DateTime.offsetLabel(-330)).toBe("UTC−05:30")
    expect(() => usePreferences.getState().setOffset(841)).toThrow()
    expect(() => usePreferences.getState().setOffset(1)).toThrow()
  })
});
