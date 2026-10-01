import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadYamlConfigSync } from "../server/src/frame/config/loader";
import { AppOptions } from "../server/src/frame/config/schema";

const root = resolve(import.meta.dir, "..");
const filePath = resolve(root, "docker/config.yaml");
const env = {
  CBX_ADMIN_USERNAME: "admin",
  CBX_ADMIN_PASSWORD: "strong-password",
  CBX_PUBLIC_ORIGIN: "",
  CBX_COOKIE_SECURE: "false",
  CBX_TLS_CERT_FILE: "",
  CBX_TLS_KEY_FILE: "",
};

function effectiveWeb(environment: typeof env) {
  const result = spawnSync(process.execPath, [
    "-e",
    "import { config } from './server/src/config/index.ts'; console.log(JSON.stringify({ publicOrigin: config.publicOrigin ?? null, cookieSecure: config.cookieSecure }));",
  ], {
    cwd: root,
    env: { ...process.env, ...environment, APP_CONFIG_FILE: filePath },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}

describe("Docker configuration", () => {
  it("resolves administrator credentials and defaults to an HTTP listener", () => {
    const value = loadYamlConfigSync({ filePath, env, mergeModeFile: false, mergeImportFiles: false });
    expect(value.administrator).toMatchObject({ username: env.CBX_ADMIN_USERNAME, password: env.CBX_ADMIN_PASSWORD });
    expect(AppOptions.parse(value.app)).toMatchObject({ host: "0.0.0.0", port: 28787 });
    expect(effectiveWeb(env)).toEqual({ publicOrigin: null, cookieSecure: false });
  });

  it("resolves HTTPS certificate paths and secure web settings", () => {
    const secure = {
      ...env,
      CBX_ADMIN_USERNAME: "owner",
      CBX_PUBLIC_ORIGIN: "https://clipboard.example.com",
      CBX_COOKIE_SECURE: "true",
      CBX_TLS_CERT_FILE: "../tls/fullchain.pem",
      CBX_TLS_KEY_FILE: "../tls/privkey.pem",
    };
    const value = loadYamlConfigSync({ filePath, env: secure, mergeModeFile: false, mergeImportFiles: false });
    expect(AppOptions.parse(value.app).tls).toEqual({ certFile: secure.CBX_TLS_CERT_FILE, keyFile: secure.CBX_TLS_KEY_FILE });
    expect(value.administrator).toMatchObject({ username: secure.CBX_ADMIN_USERNAME });
    expect(effectiveWeb(secure)).toEqual({ publicOrigin: secure.CBX_PUBLIC_ORIGIN, cookieSecure: true });
  });

  it("rejects deployment without the required administrator password", () => {
    expect(() => loadYamlConfigSync({
      filePath,
      env: { ...env, CBX_ADMIN_PASSWORD: undefined },
      mergeModeFile: false,
      mergeImportFiles: false,
    })).toThrow("CBX_ADMIN_PASSWORD");
  });
});
