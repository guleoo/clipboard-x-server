import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const root = resolve(import.meta.dir, "../..");
const readme = readFileSync(resolve(root, "README.md"), "utf8");

describe("project README", () => {
  it("lists the GNOME implementation in the client platform section", () => {
    const introduction = readme.split("## ✨ 能做什么")[0];
    const platforms = readme.split("## 客户端平台")[1]?.split("\n## ")[0];
    expect(introduction).not.toContain("clipboard-x-gnome");
    expect(platforms).toContain("GNOME Shell");
    expect(platforms).toContain("[**`clipboard-x-gnome`**](https://github.com/Guleo/clipboard-x-gnome)");
  });

  it("documents available commands and links to repository-owned guides", () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      license: string;
      scripts: Record<string, string>;
    };
    for (const command of ["dev:server", "dev:web", "typecheck", "test", "openapi:check", "build", "compile", "package"]) {
      expect(packageJson.scripts[command]).toBeDefined();
      expect(readme).toContain(`bun run ${command}`);
    }
    for (const [, path] of readme.matchAll(/\]\((docs\/[^)]+|server\/openapi\/[^)]+)\)/g)) {
      expect(existsSync(resolve(root, path!))).toBe(true);
    }
    expect(readme).toContain("CBX_PROXY_URL");
    expect(readme).toContain("server/config.yaml");
    expect(readme).toContain("server/data/");
    expect(readme).toContain("server/logs/");
    expect(readme).toContain("[GPL-3.0](LICENSE.md)");
    expect(packageJson.license).toBe("GPL-3.0-only");
    expect(packageJson.scripts.package).toContain("--compile --archive");
    expect(existsSync(resolve(root, "LICENSE.md"))).toBe(true);
  });

  it("presents Docker, compiled release, and source startup paths", () => {
    const docker = readme.indexOf("### 快速开始");
    const native = readme.indexOf("### 自行部署");
    const source = readme.indexOf("### 从源码启动");

    expect(docker).toBeGreaterThan(0);
    expect(native).toBeGreaterThan(docker);
    expect(source).toBeGreaterThan(native);
    expect(readme).toContain("docker compose up -d");
    expect(readme).toContain("./clipboard-x-server --config ./server/config.yaml --migrate --serve");
    expect(readme).toContain("git clone https://github.com/Guleo/clipboard-x-server.git");
    expect(existsSync(resolve(root, "deploy/clipboard-x-server.service"))).toBe(false);
    expect(readFileSync(resolve(root, "docs/deployment.md"), "utf8")).not.toContain("systemd");
  });

  it("packages a persistent Docker config with environment placeholders", () => {
    const compose = parse(readFileSync(resolve(root, "docker/compose.yaml"), "utf8")) as {
      services: Record<string, { volumes: string[]; environment: Record<string, string> }>;
    };
    const dockerfile = readFileSync(resolve(root, "docker/Dockerfile"), "utf8");
    const dockerignore = readFileSync(resolve(root, "docker/Dockerfile.dockerignore"), "utf8").split("\n");
    const gitignore = readFileSync(resolve(root, ".gitignore"), "utf8").split("\n");
    const containerConfig = readFileSync(resolve(root, "docker/config.yaml"), "utf8");

    expect(compose.services["clipboard-x-server"]?.volumes).toContain("clipboard-x-config:/app/config");
    expect(compose.services["clipboard-x-server"]?.environment.CBX_ADMIN_PASSWORD).toContain("CBX_ADMIN_PASSWORD");
    expect(dockerfile.match(/\/app\/config\/config\.yaml/g)).toHaveLength(2);
    expect(dockerfile).toContain("COPY --chown=clipboard-x:clipboard-x docker/config.yaml ./config/config.yaml");
    expect(containerConfig).toContain("${env:CBX_ADMIN_PASSWORD}");
    expect(containerConfig).toContain("${env:CBX_ADMIN_USERNAME}");
    expect(containerConfig).toContain("${env:CBX_PUBLIC_ORIGIN}");
    expect(containerConfig).toContain("${env:CBX_TLS_CERT_FILE}");
    expect(containerConfig).toContain("${env:CBX_TLS_KEY_FILE}");
    expect(dockerignore).toContain("server/config.yaml");
    expect(dockerignore).toContain("server/data");
    expect(dockerignore).toContain("server/logs");
    expect(dockerignore).toContain("docker/.env");
    expect(gitignore).toContain("!.env.example");
    expect(gitignore).toContain("!docker/config.yaml");
    expect(existsSync(resolve(root, "docker/.env.example"))).toBe(true);
    expect(existsSync(resolve(root, "deploy/nginx.conf"))).toBe(false);
    expect(readme).not.toContain("chown");
  });
});
