import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "../../src/db";
import { databaseConfig } from "../../src/frame/db";

describe("release and protocol versions", () => {
  it("keeps the server release version separate from the protocol version", async () => {
    Database.init();
    Database.migrate({ migrationsFolder: databaseConfig.migrationsFolder });
    const { clipboardService } = await import("../../src/service/clipboard");
    expect(clipboardService.status()).toMatchObject({ apiVersion: 1, serverVersion: "1.0.0" });
    for (const file of ["package.json", "server/package.json", "web/package.json"]) {
      expect(JSON.parse(readFileSync(join(import.meta.dir, "../../..", file), "utf8")).version).toBe("1.0.0");
    }
    const specification = JSON.parse(readFileSync(join(import.meta.dir, "../../openapi/openapi.json"), "utf8"));
    expect(specification.info.version).toBe("v1");
    expect(specification.components.schemas.ServerStatus.properties.apiVersion).toEqual({ type: "number", const: 1 });
  });
});
