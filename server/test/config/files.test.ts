import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "bun:test";
import { parse, stringify } from "yaml";
import { loadYamlConfigSync } from "../../src/frame/config";
import { SessionOptions } from "../../src/frame/session/config";

describe("application configuration files", () => {
  it("parses each standalone Server configuration file", () => {
    for (const [filename, mode] of [
      ["config.example.yaml", "prod"],
      ["config-dev.yaml", "dev"],
      ["config-test.yaml", "test"],
    ] as const) {
      expect(() => loadYamlConfigSync({
        filePath: join(import.meta.dir, "../..", filename),
        mode,
        mergeModeFile: false,
        mergeImportFiles: false,
      })).not.toThrow();
    }
  });

  it("starts from the minimal native YAML with code defaults for omitted sections", () => {
    const root = resolve(import.meta.dir, "../../..");
    const configFile = join(import.meta.dir, "../..", "config.example.yaml");
    const result = spawnSync(process.execPath, [
      "-e",
      "import { config } from './server/src/config/index.ts'; import { FrameConfig } from './server/src/frame/config/index.ts'; console.log(JSON.stringify({ host: config.host, port: config.port, timezone: FrameConfig.App.timezone, apiPrefix: FrameConfig.App.apiPrefix, routes: FrameConfig.App.routeSurfaces, logLevel: FrameConfig.Logger.console.level, rateLimit: config.rateLimit, sessionTtl: config.sessionTtlMillis, mimeTypes: config.supportedMimeTypes }));",
    ], {
      cwd: root,
      env: { ...process.env, APP_CONFIG_FILE: configFile, APP_ENV: "prod" },
      encoding: "utf8",
    });
    if (result.status !== 0) throw new Error(result.stderr);
    expect(JSON.parse(result.stdout)).toEqual({
      host: "0.0.0.0",
      port: 28787,
      timezone: "UTC",
      apiPrefix: "/",
      routes: { admin: "/admin/api", app: "/api" },
      logLevel: "info",
      rateLimit: { limit: 600, windowMillis: 60_000 },
      sessionTtl: 604_800_000,
      mimeTypes: ["text/plain;charset=utf-8", "text/html", "image/png", "image/jpeg", "image/webp", "image/gif"],
    });
  });

  it("persists administrator changes without altering unrelated configuration", () => {
    const root = resolve(import.meta.dir, "../../..");
    const configFile = join(mkdtempSync(join(tmpdir(), "clipboard-x-config-shape-")), "config.yaml");
    copyFileSync(join(import.meta.dir, "../..", "config.example.yaml"), configFile);
    const original = parse(readFileSync(configFile, "utf8")) as Record<string, unknown>;
    const result = spawnSync(process.execPath, [
      "-e",
      "import { config } from './server/src/config/index.ts'; config.change((draft) => { draft.administrator.password = 'longer-password'; }, () => {});",
    ], {
      cwd: root,
      env: { ...process.env, APP_CONFIG_FILE: configFile, APP_ENV: "prod" },
      encoding: "utf8",
    });
    if (result.status !== 0) throw new Error(result.stderr);
    const saved = readFileSync(configFile, "utf8");
    const value = parse(saved) as Record<string, unknown>;
    expect(value).toEqual({
      ...original,
      administrator: {
        ...(original.administrator as Record<string, unknown>),
        password: "longer-password",
      },
    });
  });

  it("loads capacity limits in KB and durations in seconds into runtime units", () => {
    const root = resolve(import.meta.dir, "../../..");
    const directory = mkdtempSync(join(tmpdir(), "clipboard-x-config-units-"));
    const configFile = join(directory, "config.yaml");
    const template = parse(readFileSync(join(root, "server/config.example.yaml"), "utf8"));
    template.app["shutdown-timeout"] = 2.5;
    template.limits = { "max-object": 9.5, "max-item": 40, "max-preview": 0.5 };
    template.lifetimes = { "key-overlap": 1.25, "materialization-ttl": 45 };
    template.cleanup = { enabled: true, interval: 90.25, clipboard: { "max-age": 120.125 } };
    template.http = { "json-body-limit": 2, "rate-limit": { limit: 10, window: 1.5 } };
    template.session = { ttl: 600, "touch-interval": 2.5, "token-length": 24 };
    template.security = { "access-token-ttl": 15.5 };
    template.logger = { console: { enabled: false }, file: { enabled: false } };
    try {
      writeFileSync(configFile, stringify(template));
      const result = spawnSync(process.execPath, ["-e", `
        import { config } from './server/src/config/index.ts';
        import { SecurityConfig } from './server/src/frame/security/config.ts';
        import { SessionConfig } from './server/src/frame/session/config.ts';
        console.log(JSON.stringify({
          maxObject: config.maxObjectBytes, maxItem: config.maxItemBytes, maxPreview: config.maxPreviewBytes,
          keyOverlap: config.keyOverlapMillis, materializationTtl: config.materializationTtlMillis,
          cleanup: config.cleanup, shutdownTimeout: config.shutdownTimeoutMillis,
          jsonBodyLimit: config.jsonBodyLimitBytes, rateLimit: config.rateLimit,
          session: SessionConfig, accessTokenTtl: SecurityConfig.accessTokenTtlMillis,
        }));
      `], {
        cwd: root,
        env: { ...process.env, APP_CONFIG_FILE: configFile, APP_ENV: "prod" },
        encoding: "utf8",
      });
      if (result.status !== 0) throw new Error(result.stderr);
      expect(JSON.parse(result.stdout)).toEqual({
        maxObject: 9.5 * 1024, maxItem: 40 * 1024, maxPreview: 512,
        keyOverlap: 1250, materializationTtl: 45_000,
        cleanup: { enabled: true, intervalMillis: 90_250, clipboard: { maxAgeMillis: 120_125 } },
        shutdownTimeout: 2500, jsonBodyLimit: 2 * 1024,
        rateLimit: { limit: 10, windowMillis: 1500 },
        session: { ttlMillis: 600_000, touchIntervalMillis: 2500, tokenBytes: 24 },
        accessTokenTtl: 15_500,
      });
      expect(() => SessionOptions.parse({ ttl: 0.0014, touchInterval: 0.001 }))
        .toThrow("Session touch interval must be shorter than its TTL");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
