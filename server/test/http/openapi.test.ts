import { describe, expect, it } from "bun:test";
import { createApp, generateSpecs, mountRoutes } from "../../src/frame/hono";
import { routes } from "../../src/route";

describe("product authentication documentation", () => {
  it("documents both credentials required by every device operation", async () => {
    const app = createApp();
    mountRoutes(app, routes);
    const document = await generateSpecs(app);

    expect(document.paths["/api/v1/device"]?.get?.security).toEqual([
      { deviceKey: [], deviceId: [] },
    ]);
    expect(document.paths["/admin/api/v1/devices"]?.get?.security).toEqual([
      { adminSession: [] },
    ]);
    expect(document.paths["/admin/api/v1/configuration/cleanup"]?.patch?.security).toEqual([
      { adminSession: [] },
    ]);
  });
});
