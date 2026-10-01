import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

describe("version consistency", () => {
  it("keeps workspace release versions consistent", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    for (const directory of manifest.workspaces as string[]) {
      const workspace = JSON.parse(readFileSync(resolve(root, directory, "package.json"), "utf8"));
      expect(workspace.version).toBe(manifest.version);
    }
  });

  it("uses the API version for the protocol rather than the server release", () => {
    const specification = JSON.parse(readFileSync(resolve(root, "server/openapi/openapi.json"), "utf8"));
    const version = specification.components.schemas.ServerStatus.properties.apiVersion.const;
    expect(Number.isInteger(version)).toBe(true);
    expect(version).toBeGreaterThan(0);
    expect(specification.info.version).toBe(`v${version}`);
  });
});
