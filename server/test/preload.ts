import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

process.env.APP_ENV ??= "test";
if (!process.env.APP_CONFIG_FILE) {
  const directory = mkdtempSync(resolve(tmpdir(), "clipboard-x-server-test-"));
  const config = resolve(directory, "config.yaml");
  writeFileSync(config, `app:
  name: clipboard-x-server-test
  hostname: 127.0.0.1
  port: 0
  timezone: UTC
  api-prefix: /
  route-surfaces:
    admin: /admin/api
    app: /api
data-dir: ${resolve(directory, "data")}
logger:
  console:
    enabled: false
  file:
    enabled: false
web:
  root: ${resolve(import.meta.dir, "../../web/dist")}
  cookie-secure: false
content:
  supported-mime-types:
    - text/plain;charset=utf-8
administrator:
  username: admin
  password: test-password
devices: []
channels: []
security:
  jwt-secret: test-only-secret-not-for-production-0001
  password:
    memory-cost: 19456
    time-cost: 2
session:
  ttl-millis: 604800000
  touch-interval-millis: 300000
  token-bytes: 32
`);
  process.env.APP_CONFIG_FILE = config;
  process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
}
