import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "bun:test";
import { parse } from "yaml";
import { z } from "zod";
import {
  ConfigManager,
  fieldNameMappers,
  loadYamlConfig,
  loadYamlConfigSync,
} from "../src/frame/config";

describe("configuration", () => {
  it("keeps every committed Server configuration standalone", () => {
    const requiredSections = [
      "administrator",
      "app",
      "channels",
      "cleanup",
      "devices",
      "lifetimes",
      "limits",
      "web",
    ];

    for (const [filename, mode, dataDir] of [
      ["config.example.yaml", "prod", "./data"],
      ["config-dev.yaml", "dev", "./data/dev"],
      ["config-test.yaml", "test", "./data/test"],
    ] as const) {
      const value = loadYamlConfigSync({
        filePath: join(import.meta.dir, "..", filename),
        mode,
        mergeModeFile: false,
        mergeImportFiles: false,
      });
      expect(Object.keys(value).sort()).toEqual(requiredSections);
      expect(value.app).toEqual({ host: "127.0.0.1", port: filename === "config-test.yaml" ? 0 : 28787, timezone: "UTC", dataDir });
      expect(value.import).toBeUndefined();
    }
  });

  it("starts from the minimal native YAML with code defaults for omitted sections", () => {
    const root = resolve(import.meta.dir, "../..");
    const configFile = join(import.meta.dir, "..", "config.example.yaml");
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
      host: "127.0.0.1",
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

  it("keeps the minimal YAML shape after a managed configuration update", () => {
    const root = resolve(import.meta.dir, "../..");
    const configFile = join(mkdtempSync(join(tmpdir(), "clipboard-x-config-shape-")), "config.yaml");
    copyFileSync(join(import.meta.dir, "..", "config.example.yaml"), configFile);
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
    expect(Object.keys(value)).toEqual([
      "app", "web", "limits", "lifetimes", "cleanup", "administrator", "devices", "channels",
    ]);
    expect(value.app).toEqual({ host: "127.0.0.1", port: 28787, timezone: "UTC", "data-dir": "./data" });
    expect((value.administrator as Record<string, unknown>).password).toBe("longer-password");
    expect(saved).toContain("\nweb:\n");
    expect(saved).toContain("\ncleanup:\n");
  });

  it("applies context, base, imports, and mode in the governed order", () => {
    const root = mkdtempSync(join(tmpdir(), "hono-config-"));
    writeFileSync(
      join(root, "config.yaml"),
      [
        "import:",
        "  - ./first.yaml",
        "  - ./second.yaml",
        "value: base",
        "nested-value:",
        "  count: 1",
        'copied: "${nested-value.count}"',
      ].join("\n"),
    );
    writeFileSync(join(root, "first.yaml"), "value: first\n");
    writeFileSync(
      join(root, "second.yaml"),
      "value: second\nnested-value:\n  count: 2\n",
    );
    writeFileSync(join(root, "config-prod.yaml"), "value: mode\n");

    const value = loadYamlConfigSync({
      cwd: root,
      mode: "prod",
      context: { value: "context", fallback: true },
    });
    expect(value).toEqual({
      value: "mode",
      fallback: true,
      nestedValue: { count: 2 },
      copied: 2,
    });
  });

  it("can keep mode metadata without merging the mode-specific file", async () => {
    const root = mkdtempSync(join(tmpdir(), "hono-config-mode-disabled-"));
    writeFileSync(join(root, "config.yaml"), "value: base\n");
    writeFileSync(join(root, "config-prod.yaml"), "value: mode\n");

    expect(loadYamlConfigSync({ cwd: root, mode: "prod" })).toEqual({ value: "mode" });
    expect(loadYamlConfigSync({ cwd: root, mode: "prod", mergeModeFile: false }))
      .toEqual({ value: "base" });
    expect(await loadYamlConfig({ cwd: root, mode: "prod", mergeModeFile: false }))
      .toEqual({ value: "base" });
    expect(new ConfigManager({ cwd: root, mode: "prod", mergeModeFile: false }).get())
      .toEqual({ value: "base" });
  });

  it("can ignore imports while keeping import merging enabled by default", async () => {
    const root = mkdtempSync(join(tmpdir(), "hono-config-imports-disabled-"));
    writeFileSync(join(root, "config.yaml"), "import:\n  - ./imported.yaml\nvalue: base\n");
    writeFileSync(join(root, "imported.yaml"), "value: imported\n");

    expect(loadYamlConfigSync({ cwd: root })).toEqual({ value: "imported" });
    expect(loadYamlConfigSync({ cwd: root, mergeImportFiles: false }))
      .toEqual({ value: "base" });
    expect(await loadYamlConfig({ cwd: root, mergeImportFiles: false }))
      .toEqual({ value: "base" });
    expect(new ConfigManager({ cwd: root, mergeImportFiles: false }).get())
      .toEqual({ value: "base" });
  });

  it("supports registered field mappers and immutable parsed sections", () => {
    const root = mkdtempSync(join(tmpdir(), "hono-config-manager-"));
    writeFileSync(join(root, "config.yaml"), "feature_value:\n  enabled: true\n");
    fieldNameMappers.register({
      name: "test_mapper",
      toTargetName: (name) => name.replace("_value", ""),
      toSourceName: (name) => `${name}_value`,
    });
    try {
      const config = new ConfigManager({ cwd: root, fieldNameMapper: "test_mapper" });
      const schema = z.object({ enabled: z.boolean() }).strict();
      const feature = config.section("feature", schema);
      expect(feature).toEqual({ enabled: true });
      expect(Object.isFrozen(feature)).toBe(true);
      expect(config.section("feature", schema)).toBe(feature);
    } finally {
      fieldNameMappers.unregister("test_mapper");
    }
  });
});
