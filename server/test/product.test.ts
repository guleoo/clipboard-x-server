import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CleanupOptions, ManagedConfigurationSchema, config } from "../src/config";
import { Database, db } from "../src/db";
import { databaseConfig } from "../src/frame/db";
import { configLoadOptions, loadYamlConfigSync } from "../src/frame/config";
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
  it("keeps the server release version separate from the protocol version", async () => {
    Database.init();
    Database.migrate({ migrationsFolder: databaseConfig.migrationsFolder });
    const { clipboardService } = await import("../src/service/clipboard");
    expect(clipboardService.status()).toMatchObject({ apiVersion: 1, serverVersion: "1.0.0" });
    for (const file of ["package.json", "server/package.json", "web/package.json"]) {
      expect(JSON.parse(readFileSync(join(import.meta.dir, "../..", file), "utf8")).version).toBe("1.0.0");
    }
    const specification = JSON.parse(readFileSync(join(import.meta.dir, "../openapi/openapi.json"), "utf8"));
    expect(specification.info.version).toBe("v1");
    expect(specification.components.schemas.ServerStatus.properties.apiVersion).toEqual({ type: "number", const: 1 });
  });

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

  it("enables cleanup with a 1000-item device-in-channel limit and 30-day retention by default", () => {
    const defaults = {
      enabled: true,
      intervalMillis: 3_600_000,
      clipboard: { maxItemsPerDevicePerChannel: 1000, maxAgeMillis: 2_592_000_000 },
    };
    expect(CleanupOptions.parse(undefined)).toEqual(defaults);
    expect(CleanupOptions.parse({})).toEqual(defaults);
    expect(config.cleanup).toEqual(defaults);
    expect(CleanupOptions.parse({ enabled: false, clipboard: {} })).toEqual({
      enabled: false, intervalMillis: 3_600_000, clipboard: {},
    });
    const parsed = CleanupOptions.parse({
      enabled: true,
      intervalMillis: 60_000,
      clipboard: {
        maxItems: 100,
        maxItemsPerDevice: 10,
        maxItemsPerChannel: 20,
        maxItemsPerDevicePerChannel: 5,
        maxAgeMillis: 60_000,
      },
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.intervalMillis).toBe(60_000);
    expect(parsed.clipboard.maxItemsPerDevicePerChannel).toBe(5);
    expect(() => CleanupOptions.parse({ clipboard: { maxItemsPerDevice: 0 } })).toThrow();
    expect(() => CleanupOptions.parse({ intervalMillis: 100 })).toThrow();
    expect(() => CleanupOptions.parse({ objects: {} })).toThrow();
    expect(() => CleanupOptions.parse({ execution: {} })).toThrow();
    expect(() => CleanupOptions.parse({ triggers: {} })).toThrow();
  });

  it("writes cleanup configuration to formatted YAML and updates the active policy", () => {
    const original = config.cleanup;
    const before = readFileSync(config.path, "utf8");
    try {
      expect(() => config.updateCleanup({ clipboard: { maxItemsPerChannel: 0 } })).toThrow();
      expect(readFileSync(config.path, "utf8")).toBe(before);
      const saved = config.updateCleanup({
        enabled: true,
        clipboard: { maxItemsPerDevice: 12, maxAgeMillis: 86_400_000 },
      });
      expect(saved).toEqual(CleanupOptions.parse({
        enabled: true,
        clipboard: { maxItemsPerDevice: 12, maxAgeMillis: 86_400_000 },
      }));
      expect(config.cleanup).toEqual(saved);
      const yaml = readFileSync(config.path, "utf8");
      expect(yaml).toContain("cleanup:\n");
      expect(yaml).toContain("max-items-per-device: 12\n");
      expect(yaml).toContain("max-age-millis: 86400000\n");
      expect(yaml).toContain("  - ");
      expect(() => config.updateCleanup({ clipboard: { maxItemsPerDevice: -1 } })).toThrow();
      expect(readFileSync(config.path, "utf8")).toBe(yaml);
    } finally {
      config.updateCleanup(original);
    }
  });

  it("ignores mode-specific YAML for the writable application configuration", () => {
    const overridePath = join(dirname(config.path), "config-test.yaml");
    expect(existsSync(overridePath)).toBe(false);
    try {
      writeFileSync(overridePath, "cleanup:\n  enabled: true\n");
      expect(configLoadOptions).toMatchObject({
        mode: "test",
        mergeModeFile: false,
        mergeImportFiles: false,
      });
      expect(CleanupOptions.parse(loadYamlConfigSync(configLoadOptions).cleanup))
        .toEqual(config.cleanup);
    } finally {
      rmSync(overridePath, { force: true });
    }
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
    expect(document.paths["/admin/api/v1/configuration/cleanup"]?.patch?.security).toEqual([
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
