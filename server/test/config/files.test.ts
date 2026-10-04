import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "bun:test";
import { parse } from "yaml";
import { loadYamlConfigSync } from "../../src/frame/config";

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
});
