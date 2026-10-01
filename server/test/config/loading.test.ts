import { describe, expect, it } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CleanupOptions, config } from "../../src/config";
import { configLoadOptions, loadYamlConfigSync } from "../../src/frame/config";

describe("application configuration loading", () => {
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
});
