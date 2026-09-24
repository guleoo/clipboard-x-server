import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repository = resolve(import.meta.dir, "../..");

function document(path: string): string {
  return readFileSync(resolve(repository, path), "utf8");
}

describe("protocol ownership", () => {
  it("keeps the machine and human contracts in the Server repository", () => {
    const english = document("docs/protocol.md");
    const chinese = document("docs/zh-CN/protocol.md");

    expect(english).toContain("Clipboard X Server owns the protocol");
    expect(english).toContain("server/openapi/openapi.json");
    expect(english).toContain("Client conformance checklist");
    expect(chinese).toContain("协议由 Clipboard X Server 负责制定");
    expect(chinese).toContain("客户端兼容性检查表");
  });

  it("explains the workflow, fields, errors, and progress without requiring OpenAPI", () => {
    const english = document("docs/protocol.md");
    const chinese = document("docs/zh-CN/protocol.md");
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
    const chinese = document("docs/zh-CN/protocol.md").split("## 端点索引\n")[1];
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
});
