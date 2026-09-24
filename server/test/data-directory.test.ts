import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { config } from "../src/config";
import { FrameConfig, configPath } from "../src/frame/config";
import { databaseConfig } from "../src/frame/db";

describe("data directory", () => {
  it("places SQLite and objects under the single configured directory", () => {
    const dataDir = join(dirname(configPath), "data");
    expect(FrameConfig.DataDir).toBe(dataDir);
    expect(config.dataDirectory).toBe(dataDir);
    expect(databaseConfig.url).toBe(join(dataDir, "clipboard-x.db"));
    expect(config.objectDirectory).toBe(join(dataDir, "objects"));
    expect(databaseConfig.migrationsFolder).toBe(resolve(import.meta.dir, "../drizzle"));
    expect(existsSync(databaseConfig.migrationsFolder)).toBe(true);
  });

  it("keeps file logs independent from data storage", () => {
    expect(FrameConfig.Logger.file.dir).toBe(join(dirname(configPath), "logs"));
  });
});
