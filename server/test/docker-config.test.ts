import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { loadYamlConfigSync } from "../src/frame/config/loader";
import { AppOptions } from "../src/frame/config/schema";

const filePath = resolve(import.meta.dir, "../../docker/config.yaml");
const env = {
  CBX_HOST: "0.0.0.0",
  CBX_PORT: "28787",
  CBX_ADMIN_USERNAME: "admin",
  CBX_ADMIN_PASSWORD: "strong-password",
  CBX_PUBLIC_ORIGIN: "http://127.0.0.1:28787",
  CBX_COOKIE_SECURE: "false",
  CBX_TLS_CERT_FILE: "",
  CBX_TLS_KEY_FILE: "",
};

describe("Docker configuration", () => {
  it("resolves environment placeholders through the existing configuration loader", () => {
    const config = loadYamlConfigSync({
      filePath,
      env,
      mergeModeFile: false,
      mergeImportFiles: false,
    });

    expect((config.administrator as Record<string, unknown>).password).toBe("strong-password");
    expect((config.administrator as Record<string, unknown>).username).toBe("admin");
    expect(AppOptions.parse(config.app)).toMatchObject({ hostname: "0.0.0.0", port: 28787 });
    expect((config.database as Record<string, unknown>).migrationsFolder).toBe("../server/drizzle");
    expect((config.web as Record<string, unknown>).publicOrigin).toBe("http://127.0.0.1:28787");
  });

  it("accepts HTTPS certificate paths and a custom network binding", () => {
    const config = loadYamlConfigSync({
      filePath,
      env: {
        ...env,
        CBX_HOST: "::",
        CBX_PORT: "8443",
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
      hostname: "::",
      port: 8443,
      tls: { certFile: "../tls/fullchain.pem", keyFile: "../tls/privkey.pem" },
    });
    expect((config.administrator as Record<string, unknown>).username).toBe("owner");
    expect((config.web as Record<string, unknown>).cookieSecure).toBe("true");
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
