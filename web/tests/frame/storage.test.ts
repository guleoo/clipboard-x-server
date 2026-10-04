import { afterEach, describe, expect, test } from "bun:test";
import "../support/dom"
import { z } from "zod";
const { LocalStorage } = await import("../../src/frame/common/storage");

afterEach(() => localStorage.clear())

describe("governed local storage", () => {
  test("round-trips a schema-valid versioned value", () => {
    const item = LocalStorage.scope("test").item({ key: "theme", version: 1, schema: z.enum(["light", "dark"]), fallback: () => "light" as const })
    expect(item.set("dark")).toEqual({ ok: true })
    expect(item.inspect()).toEqual({ value: "dark", source: "storage" })
  })

  test("removes malformed persisted data and returns a validated fallback", () => {
    localStorage.setItem("test:theme", "not-json")
    const item = LocalStorage.scope("test").item({ key: "theme", version: 1, schema: z.enum(["light", "dark"]), fallback: () => "light" as const })
    expect(item.inspect()).toEqual({ value: "light", source: "fallback", reason: "invalid" })
    expect(localStorage.getItem("test:theme")).toBeNull()
  })
})
