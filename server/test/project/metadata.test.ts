import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const homepage = "https://github.com/guleoo/clipboard-x-server";
const author = { name: "guleoo", url: "https://github.com/guleoo" };

describe("project metadata", () => {
  it("keeps author, license, and homepage consistent across workspaces", () => {
    for (const directory of ["", "server", "web"]) {
      const manifest = JSON.parse(readFileSync(resolve(root, directory, "package.json"), "utf8")) as {
        author: unknown;
        license: string;
        homepage: string;
        repository?: unknown;
      };
      expect(manifest.author).toEqual(author);
      expect(manifest.license).toBe("GPL-3.0-or-later");
      expect(manifest.homepage).toBe(homepage);
      expect(manifest.repository).toBeUndefined();
    }
  });
});
