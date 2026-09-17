import { resolve } from "node:path";
import { describe, expect, it } from "bun:test";

interface PackageManifest {
  readonly scripts?: Readonly<Record<string, string>>;
}

const root = resolve(import.meta.dir, "../..");

describe("workspace development commands", () => {
  it("starts Server and Web independently without workspace output wrapping", async () => {
    const manifest = await Bun.file(resolve(root, "package.json")).json() as PackageManifest;
    const server = await Bun.file(resolve(root, "server/package.json")).json() as PackageManifest;

    expect(manifest.scripts?.dev).toBeUndefined();
    expect(manifest.scripts?.["dev:server"]).toBe(
      "bun run --cwd server dev",
    );
    expect(manifest.scripts?.["dev:web"]).toBe(
      "bun run --cwd web dev",
    );
    expect(server.scripts?.dev).toBe(
      "bun run scripts/db/migrate.ts --config ../config.yaml && bun --hot src/index.ts --config ../config.yaml",
    );
    expect(server.scripts?.start).toBe(
      "bun src/index.ts --config ../config.yaml",
    );
    expect(await Bun.file(resolve(root, "server/scripts/dev.ts")).exists()).toBe(false);
  });
});
