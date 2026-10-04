import { describe, expect, it } from "bun:test";
import { createApp } from "../../src/frame/hono";
import { AuthError } from "../../src/frame/security";
import { productErrorHandler } from "../../src/route/error";

describe("product authentication errors", () => {
  it("maps authentication failures by public API surface", async () => {
    const app = createApp();
    app.onError(productErrorHandler);
    app.get("/admin/api/v1/session", () => { throw new AuthError(); });
    app.get("/api/v1/device", () => { throw new AuthError(); });

    const administrator = await app.request("/admin/api/v1/session");
    expect(administrator.status).toBe(401);
    expect(await administrator.json()).toMatchObject({
      error: { code: "not_authenticated" },
    });

    const device = await app.request("/api/v1/device");
    expect(device.status).toBe(401);
    expect(await device.json()).toMatchObject({
      error: { code: "invalid_key" },
    });
  });
});
