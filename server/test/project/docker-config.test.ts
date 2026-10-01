import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { loadYamlConfigSync } from "../../src/frame/config/loader";
import { AppOptions } from "../../src/frame/config/schema";

const filePath = resolve(import.meta.dir, "../../../docker/config.yaml");
const root = resolve(import.meta.dir, "../../..");
const env = {
  CBX_ADMIN_USERNAME: "admin",
  CBX_ADMIN_PASSWORD: "strong-password",
  CBX_PUBLIC_ORIGIN: "",
  CBX_COOKIE_SECURE: "false",
  CBX_TLS_CERT_FILE: "",
  CBX_TLS_KEY_FILE: "",
};

function effectivePublicOrigin(environment: typeof env): string {
  const result = spawnSync(process.execPath, [
    "-e",
    "import { config } from './server/src/config/index.ts'; console.log(config.publicOrigin ?? 'request origin')",
  ], {
    cwd: root,
    env: { ...process.env, ...environment, APP_CONFIG_FILE: filePath },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

describe("Docker configuration", () => {
  it("builds the local Compose service from the project Dockerfile", () => {
    type ComposeConfiguration = {
      services: Record<string, Record<string, unknown>>;
      volumes: unknown;
    };
    const base = parse(readFileSync(resolve(root, "docker/compose.yaml"), "utf8")) as ComposeConfiguration;
    const local = parse(readFileSync(resolve(root, "docker/compose.local.yaml"), "utf8")) as ComposeConfiguration;
    const { image, ...baseService } = base.services["clipboard-x-server"];
    const { build, ...localService } = local.services["clipboard-x-server"];

    expect(image).toBe("ghcr.io/guleoo/clipboard-x-server:latest");
    expect(build).toEqual({ context: "..", dockerfile: "docker/Dockerfile" });
    expect(localService).toEqual(baseService);
    expect(local.volumes).toEqual(base.volumes);
  });

  it("keeps the container listener fixed while resolving other environment placeholders", () => {
    const config = loadYamlConfigSync({
      filePath,
      env,
      mergeModeFile: false,
      mergeImportFiles: false,
    });

    expect((config.administrator as Record<string, unknown>).password).toBe("strong-password");
    expect((config.administrator as Record<string, unknown>).username).toBe("admin");
    expect(AppOptions.parse(config.app)).toMatchObject({ host: "0.0.0.0", port: 28787, timezone: "UTC", dataDir: "../data" });
    expect(config.database).toBeUndefined();
    expect(config.storage).toBeUndefined();
    expect(config.logger).toBeUndefined();
    expect((config.web as Record<string, unknown>).publicOrigin).toBe("");
    expect(effectivePublicOrigin(env)).toBe("request origin");
  });

  it("accepts HTTPS certificate paths without changing the container listener", () => {
    const config = loadYamlConfigSync({
      filePath,
      env: {
        ...env,
        CBX_ADMIN_USERNAME: "owner",
        CBX_PUBLIC_ORIGIN: "https://clipboard.example.com",
        CBX_COOKIE_SECURE: "true",
        CBX_TLS_CERT_FILE: "../tls/fullchain.pem",
        CBX_TLS_KEY_FILE: "../tls/privkey.pem",
      },
      mergeModeFile: false,
      mergeImportFiles: false,
    });

    expect(AppOptions.parse(config.app)).toMatchObject({
      host: "0.0.0.0",
      port: 28787,
      tls: { certFile: "../tls/fullchain.pem", keyFile: "../tls/privkey.pem" },
    });
    expect((config.administrator as Record<string, unknown>).username).toBe("owner");
    expect((config.web as Record<string, unknown>).cookieSecure).toBe("true");
    expect(effectivePublicOrigin({ ...env, CBX_PUBLIC_ORIGIN: "https://clipboard.example.com" }))
      .toBe("https://clipboard.example.com");
  });

  it("fails when a required environment variable is absent", () => {
    expect(() => loadYamlConfigSync({
      filePath,
      env: { ...env, CBX_ADMIN_PASSWORD: undefined },
      mergeModeFile: false,
      mergeImportFiles: false,
    })).toThrow("CBX_ADMIN_PASSWORD");
  });
});
