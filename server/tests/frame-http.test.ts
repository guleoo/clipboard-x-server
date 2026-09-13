import { describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { requestContext } from "../src/frame/hono/request-context"
import { requestLogger } from "../src/frame/hono/request-logger"

describe("governed HTTP infrastructure", () => {
  test("request logs use the matched route template instead of concrete parameters", async () => {
    const entries: Array<Record<string, unknown> | undefined> = []
    const app = new Hono()
    app.use("*", requestContext)
    app.use("*", requestLogger({ logger: {
      info(_message, fields) { entries.push(fields) },
    } }))
    app.get("/items/:itemId", (context) => context.json({ ok: true }))
    app.get("*", (context) => context.text("fallback"))

    expect((await app.request("/items/secret-item-id?token=secret")).status).toBe(200)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.route).toBe("/items/:itemId")
    expect(JSON.stringify(entries[0])).not.toContain("secret")
  })
})
