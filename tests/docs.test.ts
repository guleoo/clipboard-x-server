import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const pairs = [
  ["README.md", "README_CN.md"],
  ["docs/architecture.md", "docs/architecture_CN.md"],
  ["docs/deployment.md", "docs/deployment_CN.md"],
  ["docs/operations.md", "docs/operations_CN.md"],
  ["docs/protocol.md", "docs/protocol_CN.md"],
  ["docs/release.md", "docs/release_CN.md"],
  ["web/docs/architecture.md", "web/docs/architecture_CN.md"],
] as const;

describe("documentation validity", () => {
  it("provides both languages with working relative file links", () => {
    for (const path of pairs.flat()) {
      const contents = readFileSync(resolve(root, path), "utf8");
      expect(contents.trim().length).toBeGreaterThan(0);
      for (const [, href] of contents.matchAll(/\]\(([^)]+)\)/g)) {
        const target = href!.split("#", 1)[0]!;
        if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
        expect(existsSync(resolve(root, dirname(path), decodeURI(target)))).toBe(true);
      }
    }
  });

  it("provides parseable JSON examples in both protocol guides", () => {
    for (const path of ["docs/protocol.md", "docs/protocol_CN.md"]) {
      const guide = readFileSync(resolve(root, path), "utf8");
      const examples = [...guide.matchAll(/```json\s*\n([\s\S]*?)\n```/gu)];
      expect(examples.length).toBeGreaterThan(0);
      for (const [, example] of examples) expect(() => JSON.parse(example!)).not.toThrow();
    }
  });

  it("documents every device endpoint from the OpenAPI contract in both languages", () => {
    const specification = JSON.parse(readFileSync(resolve(root, "server/openapi/openapi.json"), "utf8")) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const methods = new Set(["get", "put", "post", "delete", "patch"]);
    for (const path of ["docs/protocol.md", "docs/protocol_CN.md"]) {
      const guide = readFileSync(resolve(root, path), "utf8");
      for (const [endpoint, operations] of Object.entries(specification.paths)) {
        if (!endpoint.startsWith("/api/")) continue;
        for (const method of Object.keys(operations).filter((value) => methods.has(value))) {
          const escaped = endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          expect(guide).toMatch(new RegExp(`\\b${method.toUpperCase()}\\s+${escaped}(?=\\s|$|\x60|\\|)`, "m"));
        }
      }
    }
  });
});
