import { describe, expect, it } from "bun:test";
import { createServerApp } from "../src/entry";
import { routes } from "../src/route";

describe("application", () => {
  it("serves the composed application route", async () => {
    const app = createServerApp(routes);
    const response = await app.request("/health/live");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: 200, msg: "ok" });

  });
});
