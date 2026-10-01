import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../../..");
const pairs = [
  ["README.md", "README_CN.md"],
  ["docs/architecture.md", "docs/architecture_CN.md"],
  ["docs/deployment.md", "docs/deployment_CN.md"],
  ["docs/operations.md", "docs/operations_CN.md"],
  ["docs/protocol.md", "docs/protocol_CN.md"],
  ["docs/release.md", "docs/release_CN.md"],
  ["web/docs/architecture.md", "web/docs/architecture_CN.md"],
] as const;

describe("documentation languages", () => {
  it("keeps English entry points and reciprocal Chinese translations", () => {
    for (const [englishPath, chinesePath] of pairs) {
      const english = readFileSync(resolve(root, englishPath), "utf8");
      const chinese = readFileSync(resolve(root, chinesePath), "utf8");
      expect(english).toMatch(/^(?:# |<h1\b)/);
      expect(chinese).toMatch(/^(?:# |<h1\b)/);
      expect(english).toContain(basename(chinesePath));
      expect(chinese).toContain(basename(englishPath));
    }
  });

  it("resolves relative document links in both languages", () => {
    for (const [englishPath, chinesePath] of pairs) {
      for (const path of [englishPath, chinesePath]) {
        const contents = readFileSync(resolve(root, path), "utf8");
        for (const [, href] of contents.matchAll(/\]\(([^)]+)\)/g)) {
          const target = href!.split("#", 1)[0]!;
          if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
          expect(existsSync(resolve(root, dirname(path), decodeURI(target)))).toBe(true);
        }
      }
    }
  });
});
