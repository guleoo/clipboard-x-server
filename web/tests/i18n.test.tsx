import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { DateTime } from "../src/frame/common/date"
import { LocalizedError } from "../src/frame/common/error"
import { RequestError } from "../src/frame/request"

if (!("document" in globalThis)) GlobalRegistrator.register({ url: "http://localhost" })

const { act, cleanup, fireEvent, render, screen } = await import("@testing-library/react")
const { i18n, resources } = await import("../src/i18n")
const { usePreferences } = await import("../src/stores/preferences")
const { RouterStore } = await import("../src/stores/router")
const { LanguageSelector } = await import("../src/components/domain/language-selector")
const { DisplayPreferences } = await import("../src/components/domain/display-preferences")
const { formatDate, messageOf, errorMessage } = await import("../src/utils/format")

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

function strings(value: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof child === "string" ? [[path, child]] : Object.entries(strings(child as object, path))
  }))
}
function variables(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/gu)].map((match) => match[1]!).sort()
}

describe("language resources", () => {
  test("provides complete translations with matching interpolation variables", () => {
    const english = strings(resources.en)
    const chinese = strings(resources["zh-CN"])
    expect(Object.keys(chinese).sort()).toEqual(Object.keys(english).sort())
    for (const [key, value] of Object.entries(english)) {
      expect(chinese[key]!.trim().length).toBeGreaterThan(0)
      expect(variables(chinese[key]!)).toEqual(variables(value))
    }
  })

  test("uses English by default and handles English and Chinese quantities", async () => {
    expect(i18n.resolvedLanguage).toBe("en")
    expect(document.documentElement.lang).toBe("en")
    expect<string>(i18n.t("clipboard:members", { count: 1 })).toBe("1 member")
    expect<string>(i18n.t("clipboard:members", { count: 2 })).toBe("2 members")
    await i18n.changeLanguage("zh-CN")
    expect<string>(i18n.t("clipboard:members", { count: 2 })).toBe("2 个成员")
    expect(document.documentElement.lang).toBe("zh-CN")
  })

  test("translates the same error again after switching language without changing its diagnostics", async () => {
    const error = new RequestError("business", "original diagnostic", 403, "not_authorized", "request-1")
    expect(messageOf(error)).toBe("You do not have permission to perform this action.")
    await i18n.changeLanguage("zh-CN")
    expect(messageOf(error)).toBe("你没有执行此操作的权限。")
    expect(error.message).toBe("original diagnostic")
    expect(error.requestId).toBe("request-1")
    expect(errorMessage("unknown_code")).toBe("服务器暂时无法完成请求。")
    expect(messageOf(new RequestError("timeout", "diagnostic"))).toBe("请求超时。")
    expect(messageOf(new LocalizedError("clipboard:imageCopyUnsupported"))).toBe("当前浏览器不支持复制图片")
  })

  test("refreshes translated route titles while preserving user routes and paths", async () => {
    const router = RouterStore.create()
    router.publishUser([{ id: "custom", name: "custom", path: "/custom", title: "My page", component: "custom" }])
    const paths = router.state.getState().routes.map((route) => route.path)
    expect(router.state.getState().menus[0]!.title).toBe("Clipboard")
    await i18n.changeLanguage("zh-CN")
    router.refresh()
    expect(router.state.getState().menus[0]!.title).toBe("剪切板")
    expect(router.state.getState().menus.find((menu) => menu.id === "custom")!.title).toBe("My page")
    expect(router.state.getState().routes.map((route) => route.path)).toEqual(paths)
  })
})

describe("UTC display preferences", () => {
  const midnight = Date.UTC(2026, 0, 1)

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
})
