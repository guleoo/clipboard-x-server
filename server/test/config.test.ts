import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  ConfigManager,
  fieldNameMappers,
  loadYamlConfig,
  loadYamlConfigSync,
} from "../src/frame/config";

describe("configuration", () => {
  it("keeps the committed development and test configurations standalone", () => {
    const requiredSections = [
      "administrator",
      "app",
      "channels",
      "cleanup",
      "content",
      "database",
      "devices",
      "http",
      "lifetimes",
      "limits",
      "logger",
      "security",
      "session",
      "storage",
      "web",
    ];

    for (const filename of ["config-dev.yaml", "config-test.yaml"]) {
      const value = loadYamlConfigSync({
        filePath: join(import.meta.dir, "..", filename),
        mode: filename === "config-dev.yaml" ? "dev" : "test",
        mergeModeFile: false,
        mergeImportFiles: false,
      });
      expect(Object.keys(value).sort()).toEqual(requiredSections);
      expect(value.import).toBeUndefined();
    }
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
