import { beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "../../src/db";
import { databaseConfig } from "../../src/frame/db";
import { clipboardService } from "../../src/service/clipboard";

beforeAll(() => {
  Database.init();
  Database.migrate({ migrationsFolder: databaseConfig.migrationsFolder });
});

describe("server status", () => {
  it("reports the release version and the documented API version", () => {
    const manifest = JSON.parse(readFileSync(resolve(import.meta.dir, "../../../package.json"), "utf8"));
    const specification = JSON.parse(readFileSync(resolve(import.meta.dir, "../../openapi/openapi.json"), "utf8"));
    expect(clipboardService.status()).toMatchObject({
      serverVersion: manifest.version,
      apiVersion: specification.components.schemas.ServerStatus.properties.apiVersion.const,
    });
  });
});
