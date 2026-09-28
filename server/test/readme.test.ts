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
    expect(readme).toContain("配置文件在 `app` 下设置 `host`、`port`、`timezone` 和 `data-dir`");
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
    expect(readme).toContain("ghcr.io/guleoo/clipboard-x-server:latest");
    expect(readme).toContain("https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/compose.yaml");
    expect(readme).toContain("https://raw.githubusercontent.com/guleoo/clipboard-x-server/master/docker/.env.example");
    expect(readme).toContain("`CBX_HOST`/`CBX_PORT` 控制宿主机对外发布的地址和端口");
    expect(readme).toContain("./clipboard-x-server --config ./server/config.yaml --migrate --serve");
    expect(readme).toContain("git clone https://github.com/guleoo/clipboard-x-server.git");
    expect(existsSync(resolve(root, "deploy/clipboard-x-server.service"))).toBe(false);
    expect(readFileSync(resolve(root, "docs/deployment.md"), "utf8")).not.toContain("systemd");
  });

  it("keeps the native example limited to the documented configuration fields", () => {
    const example = parse(readFileSync(resolve(root, "server/config.example.yaml"), "utf8")) as Record<string, unknown>;
    expect(Object.keys(example)).toEqual([
      "app", "web", "limits", "lifetimes", "cleanup", "administrator", "devices", "channels",
    ]);
    expect(example).toMatchObject({
      app: { host: "0.0.0.0", port: 28787, timezone: "UTC", "data-dir": "./data" },
      web: { root: "../web/dist", "cookie-secure": false },
      limits: {
        "max-object-bytes": 83886080,
        "max-item-bytes": 268435456,
        "max-preview-bytes": 1048576,
      },
      lifetimes: { "key-overlap-millis": 300000, "materialization-ttl-millis": 600000 },
      cleanup: { enabled: false, "interval-millis": 3600000, clipboard: {} },
      administrator: { username: "admin", password: "change-this-password" },
      devices: [],
      channels: [],
    });
    expect(Object.keys(example.app as Record<string, unknown>)).toEqual(["host", "port", "timezone", "data-dir"]);
    expect(Object.keys(example.web as Record<string, unknown>)).toEqual(["root", "cookie-secure"]);
  });

  it("packages a persistent Docker config with environment placeholders", () => {
    const compose = parse(readFileSync(resolve(root, "docker/compose.yaml"), "utf8")) as {
      services: Record<string, { image: string; build?: unknown; ports: string[]; volumes: string[]; environment: Record<string, string> }>;
    };
    const tlsCompose = parse(readFileSync(resolve(root, "docker/compose.tls.yaml"), "utf8")) as {
      services: Record<string, { volumes: Array<{ source: string; target: string; read_only: boolean }> }>;
    };
    const envExample = readFileSync(resolve(root, "docker/.env.example"), "utf8");
    const dockerfile = readFileSync(resolve(root, "docker/Dockerfile"), "utf8");
    const dockerignore = readFileSync(resolve(root, "docker/Dockerfile.dockerignore"), "utf8").split("\n");
    const gitignore = readFileSync(resolve(root, ".gitignore"), "utf8").split("\n");
    const containerConfig = readFileSync(resolve(root, "docker/config.yaml"), "utf8");

    expect(compose.services["clipboard-x-server"]?.volumes).toContain("clipboard-x-config:/app/config");
    expect(compose.services["clipboard-x-server"]?.image).toBe("ghcr.io/guleoo/clipboard-x-server:latest");
    expect(compose.services["clipboard-x-server"]?.build).toBeUndefined();
    expect(compose.services["clipboard-x-server"]?.volumes).toEqual(["clipboard-x-config:/app/config", "clipboard-x-data:/app/data"]);
    expect(compose.services["clipboard-x-server"]?.environment.CBX_ADMIN_PASSWORD).toContain("CBX_ADMIN_PASSWORD");
    expect(compose.services["clipboard-x-server"]?.environment.CBX_PUBLIC_ORIGIN).toBe("${CBX_PUBLIC_ORIGIN:-}");
    expect(compose.services["clipboard-x-server"]?.environment.CBX_HOST).toBeUndefined();
    expect(compose.services["clipboard-x-server"]?.environment.CBX_PORT).toBeUndefined();
    expect(compose.services["clipboard-x-server"]?.ports).toEqual(["${CBX_HOST:-0.0.0.0}:${CBX_PORT:-28787}:28787"]);
    expect(tlsCompose.services["clipboard-x-server"]?.volumes.map((volume) => volume.target)).toEqual([
      "/app/tls/fullchain.pem",
      "/app/tls/privkey.pem",
    ]);
    expect(tlsCompose.services["clipboard-x-server"]?.volumes.every((volume) => volume.read_only)).toBe(true);
    expect(envExample).toContain("CBX_TLS_CERT_HOST_FILE=");
    expect(envExample).toContain("CBX_TLS_KEY_HOST_FILE=");
    expect(envExample).not.toContain("CBX_TLS_HOST_DIR");
    expect(envExample).toContain("CBX_PUBLIC_ORIGIN=\n");
    expect(envExample).toContain("CBX_HOST=0.0.0.0\n");
    expect(envExample).toContain("CBX_PORT=28787\n");
    expect(envExample).not.toContain("CBX_PUBLISH_HOST");
    expect(envExample).not.toContain("CBX_PUBLISH_PORT");
    expect(dockerfile.match(/\/app\/config\/config\.yaml/g)).toHaveLength(2);
    expect(dockerfile).toContain("COPY scripts ./scripts");
    expect(dockerfile).toContain("COPY docs ./docs");
    expect(dockerfile).toContain("build.ts README.md LICENSE.md ./");
    expect(dockerfile).toContain("COPY --chown=clipboard-x:clipboard-x docker/config.yaml ./config/config.yaml");
    expect(containerConfig).toContain("${env:CBX_ADMIN_PASSWORD}");
    expect(containerConfig).toContain("${env:CBX_ADMIN_USERNAME}");
    expect(containerConfig).toContain("${env:CBX_PUBLIC_ORIGIN}");
    expect(containerConfig).toContain("host: 0.0.0.0");
    expect(containerConfig).toContain("port: 28787");
    expect(containerConfig).toContain("timezone: UTC");
    const parsedContainerConfig = parse(containerConfig) as Record<string, unknown>;
    expect(parsedContainerConfig).not.toHaveProperty("host");
    expect(parsedContainerConfig).not.toHaveProperty("data-dir");
    expect(parsedContainerConfig.app).toMatchObject({ host: "0.0.0.0", port: 28787, timezone: "UTC", "data-dir": "../data" });
    expect(containerConfig).not.toContain("hostname:");
    expect(containerConfig).not.toContain("${env:CBX_HOST}");
    expect(containerConfig).not.toContain("${env:CBX_PORT}");
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
