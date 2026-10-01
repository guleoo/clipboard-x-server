import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import "../support/dom"
const { cleanup } = await import("@testing-library/react");
const { i18n } = await import("../../src/i18n");
const { usePreferences } = await import("../../src/stores/preferences");
const { RouterStore } = await import("../../src/stores/router");
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

describe("translated routes", () => {
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
});
