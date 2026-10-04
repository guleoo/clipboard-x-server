import { describe, expect, it } from "bun:test";
import { config } from "../../src/config";
import { createApp } from "../../src/frame/hono";
import { productErrorHandler } from "../../src/route/error";
import { sameOrigin } from "../../src/route/auth";

describe("administrator request origin", () => {
  it("accepts same-origin browser requests forwarded by the Vite proxy", async () => {
    const app = createApp();
    app.onError(productErrorHandler);
    app.post("/mutation", sameOrigin, (context) => context.json({ ok: true }));

    const forwarded = await app.request("/mutation", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:3000",
        "Sec-Fetch-Site": "same-origin",
      },
    });
    expect(forwarded.status).toBe(200);

    const rejected = await app.request("/mutation", {
      method: "POST",
      headers: {
        Origin: "https://attacker.invalid",
        "Sec-Fetch-Site": "cross-site",
      },
    });
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toMatchObject({
      error: { code: "not_authorized" },
    });
  });

  it("checks the request origin when no public origin or fetch metadata is configured", async () => {
    expect(config.publicOrigin).toBeUndefined();
    const app = createApp();
    app.onError(productErrorHandler);
    app.post("/mutation", sameOrigin, (context) => context.json({ ok: true }));

    const accepted = await app.request("http://lan.example:28787/mutation", {
      method: "POST",
      headers: { Origin: "http://lan.example:28787" },
    });
    expect(accepted.status).toBe(200);

    const rejected = await app.request("http://lan.example:28787/mutation", {
      method: "POST",
      headers: { Origin: "http://another.example:28787" },
    });
    expect(rejected.status).toBe(403);
  });
});
