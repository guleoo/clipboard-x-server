import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import "../support/dom"
import { LocalizedError } from "../../src/frame/common/error";
import { RequestError } from "../../src/frame/request";
const { cleanup } = await import("@testing-library/react");
const { i18n, resources } = await import("../../src/i18n");
const { usePreferences } = await import("../../src/stores/preferences");
const { messageOf, errorMessage } = await import("../../src/utils/format");
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
});
