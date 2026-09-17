import { describe, expect, it } from "bun:test";
import { ManagedConfigurationSchema, RetentionOptions, config } from "../src/config";
import { db } from "../src/db";
import { createApp, generateSpecs, mountRoutes } from "../src/frame/hono";
import { AuthError } from "../src/frame/security";
import { zz } from "../src/frame/zod";
import { productErrorHandler } from "../src/route/error";
import { sameOrigin } from "../src/route/auth";
import { validator } from "../src/route/validator";
import { sqliteValue } from "../src/common/sqlite";
import { operationResponseSchemas } from "../src/dto/response";
import { routes } from "../src/route";

describe("Clipboard X product contracts", () => {
  it("exposes one process-wide configuration and database facade", async () => {
    const [{ config: secondConfig }, { db: secondDb }] = await Promise.all([
      import("../src/config"),
      import("../src/db"),
    ]);
    expect(secondConfig).toBe(config);
    expect(secondDb).toBe(db);
  });

  it("accepts arbitrary passwords longer than six characters", () => {
    const base = { ...config.read(), administrator: { username: "admin", password: "1234567" } };
    expect(ManagedConfigurationSchema.parse(base).administrator.password).toBe("1234567");
    expect(() => ManagedConfigurationSchema.parse({
      ...base,
      administrator: { username: "admin", password: "123456" },
    })).toThrow();
  });

  it("keeps retention opt-in and validates positive limits", () => {
    expect(config.retention).toEqual({ sweepIntervalMillis: 3_600_000 });
    expect(RetentionOptions.parse({ maxItemsPerDevice: 10, maxItemsPerChannel: 20, maxAgeMillis: 60_000 }))
      .toEqual({ maxItemsPerDevice: 10, maxItemsPerChannel: 20, maxAgeMillis: 60_000, sweepIntervalMillis: 3_600_000 });
    expect(() => RetentionOptions.parse({ maxItemsPerDevice: 0 })).toThrow();
    expect(() => RetentionOptions.parse({ maxItemsPerChannel: -1 })).toThrow();
    expect(() => RetentionOptions.parse({ sweepIntervalMillis: 100 })).toThrow();
  });

  it("separates client-owned profiles from administrator device controls", () => {
    const device = {
      id: "123e4567-e89b-42d3-a456-426614174000",
      tag: "Workstation",
      iconKind: "desktop",
      iconColor: { light: "#ffffff" },
      state: "offline",
      lastSeenAt: 0,
      createdAt: 1,
      updatedAt: 1,
      kind: "client",
    };

    expect(operationResponseSchemas.updateDeviceProfile.safeParse(device).success).toBe(true);
    expect(operationResponseSchemas.createDevice.safeParse({ ...device, keys: [] }).success).toBe(true);
    expect(operationResponseSchemas.updateDevice.safeParse({ ...device, keys: [] }).success).toBe(true);
    expect(operationResponseSchemas.updateDevice.safeParse(device).success).toBe(false);
  });

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
  });

  it("normalizes safe SQLite integers at raw-query boundaries", () => {
    expect(sqliteValue({ count: 2n, nested: [3n] })).toEqual({
      count: 2,
      nested: [3],
    });
    expect(() => sqliteValue(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(
      RangeError,
    );
  });

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
