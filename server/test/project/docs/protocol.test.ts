import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repository = resolve(import.meta.dir, "../../../..");

function document(path: string): string {
  return readFileSync(resolve(repository, path), "utf8");
}

describe("protocol ownership", () => {
  it("names the protocol after the API version without binding guides to a server release", () => {
    const specification = JSON.parse(document("server/openapi/openapi.json"));
    expect(specification.info.version).toBe("v1");
    for (const path of ["docs/protocol.md", "docs/protocol_CN.md"]) {
      const guide = document(path);
      expect(guide).toContain("`v{n}`");
      expect(guide).toContain("`/api/v1`");
      expect(guide).toContain('"apiVersion": 1');
      expect(guide).toContain('"serverVersion": "<server release version>"');
    }
    for (const path of ["README.md", "README_CN.md", "docs/release.md", "docs/release_CN.md", "docs/protocol.md", "docs/protocol_CN.md"]) {
      expect(document(path)).not.toMatch(/\bv\d+\.\d+\.\d+\b/gu);
      expect(document(path)).not.toContain('"serverVersion": "1.0.0"');
    }
    for (const path of ["docs/release.md", "docs/release_CN.md"]) {
      expect(document(path)).toContain('bun -p \'require("./package.json").version\'');
    }
  });

  it("keeps the machine and human contracts in the Server repository", () => {
    const english = document("docs/protocol.md");
    const chinese = document("docs/protocol_CN.md");

    expect(english).toContain("Clipboard X Server owns the protocol");
    expect(english).toContain("server/openapi/openapi.json");
    expect(english).toContain("Client conformance checklist");
    expect(chinese).toContain("协议由 Clipboard X Server 负责制定");
    expect(chinese).toContain("客户端兼容性检查表");
  });

  it("explains the workflow, fields, errors, and progress without requiring OpenAPI", () => {
    const english = document("docs/protocol.md");
    const chinese = document("docs/protocol_CN.md");
    for (const [guide, sections] of [
      [english, ["## Read this first", "| Manifest field | Meaning |", "| HTTP status / code |", "| State | Meaning |", "## Endpoint index"]],
      [chinese, ["## 先看这里", "| 清单字段 | 含义 |", "| HTTP 状态 / 错误码 |", "| 状态 | 含义 |", "## 端点索引"]],
    ] as const) {
      for (const section of sections)
        expect(guide).toContain(section);
      const examples = [...guide.matchAll(/```json\n([\s\S]*?)\n```/gu)];
      expect(examples.length).toBeGreaterThan(4);
      for (const [, example] of examples)
        expect(() => JSON.parse(example!)).not.toThrow();
      const publication = examples.map(([, example]) => JSON.parse(example!) as Record<string, unknown>)
        .find((example) => "uploadId" in example);
      expect(publication).toBeDefined();
      expect(publication?.transfer).toMatchObject({
        kind: "publish", direction: "upload", state: "queued", completedBytes: 0, totalBytes: 203,
      });
    }
    expect(english.indexOf("## Read this first")).toBeLessThan(english.indexOf("## Authority and evolution"));
    expect(chinese.indexOf("## 先看这里")).toBeLessThan(chinese.indexOf("## 权威来源与演进"));
  });

  it("does not delegate protocol authority to one client implementation", () => {
    const protocol = document("docs/protocol.md");

    expect(protocol).not.toContain("deliberately matches the GNOME extension");
    expect(protocol).not.toContain("/home/Guleo/");
    expect(protocol).not.toContain("GSettings");
    expect(protocol).not.toContain("Gio.Cancellable");
  });

  it("lists every device operation from the generated OpenAPI contract", () => {
    const protocol = document("docs/protocol.md").split("## Endpoint index\n")[1];
    const chinese = document("docs/protocol_CN.md").split("## 端点索引\n")[1];
    expect(protocol).toBeDefined();
    expect(chinese).toBeDefined();
    const openapi = JSON.parse(document("server/openapi/openapi.json")) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const methods = new Set(["get", "put", "post", "delete", "patch"]);

    for (const [path, operations] of Object.entries(openapi.paths)) {
      if (!path.startsWith("/api/v1"))
        continue;
      for (const method of Object.keys(operations).filter((value) => methods.has(value))) {
        const signature = `${method.toUpperCase().padEnd(7)}${path}`;
        expect(protocol).toContain(signature);
        expect(chinese).toContain(signature);
      }
    }
  });

  it("keeps relative links in both protocol guides valid", () => {
    for (const path of ["docs/protocol.md", "docs/protocol_CN.md"]) {
      const guide = document(path);
      const links = [...guide.matchAll(/\]\((?!#|https?:\/\/)([^)#]+)(?:#[^)]*)?\)/gu)];
      expect(links.length).toBeGreaterThan(0);
      for (const [, target] of links)
        expect(existsSync(resolve(repository, "docs", target!))).toBe(true);
    }
  });
});
