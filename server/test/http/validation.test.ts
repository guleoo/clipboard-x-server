import { describe, expect, it } from "bun:test";
import { createApp } from "../../src/frame/hono";
import { zz } from "../../src/frame/zod";
import { productErrorHandler } from "../../src/route/error";
import { validator } from "../../src/route/validator";

describe("product request validation", () => {
  it("adapts request validation to the product error envelope", async () => {
    const app = createApp();
    app.onError(productErrorHandler);
    app.post(
      "/api/v1/example",
      validator("json", zz.object({ name: zz.string().min(1) })),
      (context) => context.json(context.req.valid("json")),
    );

    const response = await app.request("/api/v1/example", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_request", message: "Invalid request" },
    });
  });
});
