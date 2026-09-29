import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const repositoryUrl = "git+https://github.com/guleoo/clipboard-x-server.git";
const author = { name: "guleoo", url: "https://github.com/guleoo" };

describe("project metadata", () => {
  it("attributes the root and both workspaces to the same author and repository", () => {
    for (const directory of ["", "server", "web"]) {
      const manifest = JSON.parse(readFileSync(resolve(root, directory, "package.json"), "utf8")) as {
        author: unknown;
        repository: unknown;
      };
      expect(manifest.author).toEqual(author);
      expect(manifest.repository).toEqual({
        type: "git",
        url: repositoryUrl,
        ...(directory ? { directory } : {}),
      });
    }
  });

  it("identifies the author in the Web document", () => {
    expect(readFileSync(resolve(root, "web/index.html"), "utf8"))
      .toContain('<meta name="author" content="guleoo" />');
  });
});
