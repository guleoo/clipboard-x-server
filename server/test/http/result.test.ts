import { describe, expect, it } from "bun:test";
import { createServerApp } from "../../src/entry";
import { Result } from "../../src/frame/core";
import { createPublicHono } from "../../src/frame/hono";
import { zz } from "../../src/frame/zod";
import { validator } from "../../src/frame/hono";
import { framePath } from "../support/frame-path";
describe("application validation results", () => {
  it("validates request input once and preserves the result envelope", async () => {
    const route = createPublicHono("/validation");
    route.get(
      "/:id",
      validator("param", zz.object({ id: zz.string().min(2) })),
      (context) => context.json(Result.data(context.req.valid("param"))),
    );
    const app = createServerApp([route]);

    const invalid = await app.request(framePath("/validation/x"));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ code: 400, msg: "Invalid request" });

    const valid = await app.request(framePath("/validation/ok"));
    expect(await valid.json()).toEqual({
      code: 200,
      msg: "ok",
      result: { id: "ok" },
    });
  });
});
