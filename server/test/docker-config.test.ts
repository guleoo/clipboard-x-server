import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { loadYamlConfigSync } from "../src/frame/config/loader";

const filePath = resolve(import.meta.dir, "../../docker/config.yaml");

describe("Docker configuration", () => {
  it("resolves environment placeholders through the existing configuration loader", () => {
    const config = loadYamlConfigSync({
      filePath,
      env: {
        CBX_ADMIN_PASSWORD: "strong-password",
        CBX_PUBLIC_ORIGIN: "http://127.0.0.1:28787",
      },
      mergeModeFile: false,
      mergeImportFiles: false,
    });

    expect((config.administrator as Record<string, unknown>).password).toBe("strong-password");
    expect((config.app as Record<string, unknown>).hostname).toBe("0.0.0.0");
    expect((config.database as Record<string, unknown>).migrationsFolder).toBe("../server/drizzle");
    expect((config.web as Record<string, unknown>).publicOrigin).toBe("http://127.0.0.1:28787");
  });

  it("fails when a required environment variable is absent", () => {
    expect(() => loadYamlConfigSync({
      filePath,
      env: { CBX_PUBLIC_ORIGIN: "http://127.0.0.1:28787" },
      mergeModeFile: false,
      mergeImportFiles: false,
    })).toThrow("CBX_ADMIN_PASSWORD");
  });
});
