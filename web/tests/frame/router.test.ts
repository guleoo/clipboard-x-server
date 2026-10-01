import { describe, expect, test } from "bun:test";
import { Engine, type Node } from "../../src/frame/router/core";
const valid: readonly Node[] = [
  { id: "home", name: "home", path: "/", title: "Home", component: "home", index: true },
  { id: "missing", name: "missing", path: "/missing", title: "Missing", layout: "empty", component: "missing", show: false },
  { id: "catch-all", name: "catch-all", path: "/*", title: "Catch all", layout: "empty", redirect: "/missing", show: false },
]

describe("route engine", () => {
  test("derives immutable matchable routes and visible menus from one source", () => {
    const engine = Engine.create(valid)
    const snapshot = engine.get()
    expect(snapshot.routes.map((route) => route.id)).toEqual(["home", "missing", "catch-all"])
    expect(snapshot.menus).toEqual([{ id: "home", title: "Home", path: "/", order: 255, disabled: false }])
    expect(Object.isFrozen(snapshot)).toBe(true)
  })

  test("rejects an invalid replacement without publishing partial state", () => {
    const engine = Engine.create(valid)
    const previous = engine.get()
    expect(() => engine.replace([...valid, valid[0]!])).toThrow("路由 id 重复")
    expect(engine.get()).toBe(previous)
  })
});
