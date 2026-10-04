import { beforeAll, describe, expect, it } from "bun:test";
import { Database } from "../../src/db";
import { createApp, mountRoutes } from "../../src/frame/hono";
import { Health, healthRoutes, registerDefaultHealthChecks } from "../../src/frame/health";
import { framePath } from "../support/frame-path";

  beforeAll(() => Database.init());

describe("health capability", () => {
  it("separates liveness from dependency readiness", async () => {
    registerDefaultHealthChecks(Database);
    Health.register({
      name: "required-service",
      check: () => {
        throw new Error("private dependency detail");
      },
    });
    const app = createApp();
    mountRoutes(app, [healthRoutes]);

    expect((await app.request(framePath("/health/live"))).status).toBe(200);
    const ready = await app.request(framePath("/health/ready"));
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({
      code: 503,
      msg: "Service unavailable",
      result: { failed: ["required-service"] },
    });
    Health.unregister("required-service");
  });

  it("bounds readiness checks and signals timed-out work", async () => {
    let aborted = false;
    Health.register({
      name: "slow-service",
      timeoutMillis: 5,
      check: ({ abortSignal }) =>
        new Promise<void>((_resolve, reject) => {
          abortSignal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("stopped"));
            },
            { once: true },
          );
        }),
    });

    const result = await Health.checkReady();
    expect(result.ok).toBe(false);
    expect(result.failed).toContain("slow-service");
    expect(aborted).toBe(true);
    Health.unregister("slow-service");
  });
});
