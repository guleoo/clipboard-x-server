import { describe, expect, it } from "bun:test";
import { ErrorCode, ServiceError } from "../../src/frame/core";
import { createApp, createPublicHono, HttpError, mountRoutes } from "../../src/frame/hono";
import { FrameConfig } from "../../src/frame/config";
import { framePath } from "../support/frame-path";
const ExpectedFailure = ErrorCode.of(100_001_001, "Expected failure");
class ExpectedServiceError extends ServiceError<{
  readonly resourceId: string;
}> {
  constructor(resourceId: string) {
    super(ExpectedFailure, { resourceId });
  }
}

describe("frame HTTP contracts", () => {
  it("preserves public errors and hides unexpected failures", async () => {
    const failures = createPublicHono("/failures");
    failures.get("/expected", () => {
      throw new ExpectedServiceError("resource-1");
    });
    failures.get("/unexpected", () => {
      throw new Error("private detail");
    });
    failures.get("/http", () => {
      throw new HttpError(418, "Expected HTTP failure");
    });
    const app = createApp();
    mountRoutes(app, [failures]);

    const expected = await app.request(framePath("/failures/expected"));
    expect(expected.status).toBe(400);
    expect(await expected.json()).toEqual({
      code: 400,
      msg: "Expected failure",
    });

    const unexpected = await app.request(framePath("/failures/unexpected"));
    expect(unexpected.status).toBe(500);
    expect(await unexpected.json()).toEqual({
      code: 500,
      msg: "Internal server error",
    });

    const http = await app.request(framePath("/failures/http"));
    expect(http.status).toBe(418);
    expect(await http.json()).toEqual({
      code: 418,
      msg: "Expected HTTP failure",
    });
  });

  it("propagates request IDs and returns the governed not-found response", async () => {
    const app = createApp();
    const response = await app.request("/missing", {
      headers: { "x-request-id": "test-request" },
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("x-request-id")).toBe("test-request");
    expect(await response.json()).toEqual({ code: 404, msg: "Not found" });
  });

  it("mounts global, surface, local, and route prefixes in order", async () => {
    const route = createPublicHono("/probe", { surface: "admin" });
    route.get("/", (context) => context.json({ ok: true }));
    const app = createApp();
    mountRoutes(app, [route], { prefix: "/internal" });

    const mounted = framePath("/probe", {
      surface: "admin",
      prefix: "/internal",
    })
    expect((await app.request(mounted)).status).toBe(200);
    const adminPrefix = FrameConfig.App.routeSurfaces.admin.replace(/^\/+|\/+$/g, "")
    const wrongOrder = framePath(`/internal/${adminPrefix}/probe`)
    expect((await app.request(wrongOrder)).status).toBe(404);
  });
});
