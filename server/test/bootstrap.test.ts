import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { bootstrapConfig } from "../src/bootstrap";

const templatePath = resolve(import.meta.dir, "../config.example.yaml");

function withConfig(test: (configPath: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "clipboard-x-bootstrap-"));
  try {
    test(join(directory, "config", "config.yaml"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("container configuration bootstrap", () => {
  it("creates a multiline private YAML file from the template", () => withConfig((configPath) => {
    expect(bootstrapConfig({
      configPath,
      templatePath,
      password: "strong-password",
      publicOrigin: "https://clipboard.example.com",
    })).toBe(true);
    const contents = readFileSync(configPath, "utf8");
    const config = parse(contents);
    expect(contents.split("\n").length).toBeGreaterThan(50);
    expect(config.administrator.password).toBe("strong-password");
    expect(config.app.hostname).toBe("0.0.0.0");
    expect(config.database["migrations-folder"]).toBe("../server/drizzle");
    expect(config.web["public-origin"]).toBe("https://clipboard.example.com");
    expect(config.web["cookie-secure"]).toBe(true);
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
  }));

  it("never replaces an existing authoritative YAML file", () => withConfig((configPath) => {
    const options = { configPath, templatePath, password: "first-password", publicOrigin: "http://127.0.0.1:28787" };
    bootstrapConfig(options);
    const first = readFileSync(configPath, "utf8");
    expect(bootstrapConfig({ ...options, password: "second-password", publicOrigin: "https://example.com" })).toBe(false);
    expect(readFileSync(configPath, "utf8")).toBe(first);
  }));

  it("rejects a short password before creating a config", () => withConfig((configPath) => {
    expect(() => bootstrapConfig({ configPath, templatePath, password: "short", publicOrigin: "http://localhost:28787" }))
      .toThrow("7 to 256");
  }));
});
