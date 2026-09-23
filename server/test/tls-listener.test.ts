import { describe, expect, it } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dir, "../..");

describe("TLS listener", () => {
  it("serves HTTPS with the configured certificate and private key", async () => {
    const directory = mkdtempSync(join(tmpdir(), "clipboard-x-tls-"));
    let child: Bun.Subprocess | undefined;
    try {
      const certFile = join(directory, "tls", "cert.pem");
      const keyFile = join(directory, "tls", "key.pem");
      mkdirSync(join(directory, "tls"));
      const certificate = spawnSync("openssl", [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
        "-subj", "/CN=localhost", "-keyout", keyFile, "-out", certFile,
      ], { stdio: "ignore" });
      expect(certificate.status).toBe(0);

      const configFile = join(directory, "config", "config.yaml");
      mkdirSync(join(directory, "config"));
      cpSync(resolve(root, "docker/config.yaml"), configFile);
      cpSync(resolve(root, "server/drizzle"), join(directory, "server", "drizzle"), { recursive: true });
      const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("reserved") });
      const port = reservation.port;
      await reservation.stop(true);
      const environment = {
        ...process.env,
        CBX_HOST: "127.0.0.1",
        CBX_PORT: String(port),
        CBX_ADMIN_USERNAME: "admin",
        CBX_ADMIN_PASSWORD: "test-password",
        CBX_PUBLIC_ORIGIN: `https://127.0.0.1:${port}`,
        CBX_COOKIE_SECURE: "true",
        CBX_TLS_CERT_FILE: "../tls/cert.pem",
        CBX_TLS_KEY_FILE: "../tls/key.pem",
      };

      child = Bun.spawn([process.execPath, resolve(root, "server/src/index.ts"), "--config", configFile, "--migrate", "--serve"], {
        cwd: root,
        env: environment,
        stdout: "ignore",
        stderr: "ignore",
      });

      let ready = false;
      for (let attempt = 0; attempt < 50 && !ready; attempt += 1) {
        try {
          const response = await fetch(`https://127.0.0.1:${port}/health/live`, {
            tls: { rejectUnauthorized: false },
            signal: AbortSignal.timeout(500),
          });
          ready = response.ok;
        } catch {
          await Bun.sleep(100);
        }
      }
      expect(ready).toBe(true);

      const healthcheck = spawnSync(process.execPath, [resolve(root, "server/src/index.ts"), "--config", configFile, "--healthcheck"], {
        cwd: root,
        env: environment,
        encoding: "utf8",
      });
      expect(healthcheck.status).toBe(0);

      const login = await fetch(`https://127.0.0.1:${port}/admin/api/v1/session`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: `https://127.0.0.1:${port}` },
        body: JSON.stringify({ username: "admin", password: "test-password" }),
        tls: { rejectUnauthorized: false },
      });
      expect(login.status).toBe(200);
      expect(login.headers.get("set-cookie")).toContain("Secure");
    } finally {
      child?.kill("SIGKILL");
      if (child) await child.exited;
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15_000);
});
