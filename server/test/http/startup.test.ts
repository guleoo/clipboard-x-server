import { describe, expect, it } from "bun:test";
import { Database as SQLite } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseDocument } from "yaml";

const server = resolve(import.meta.dir, "../..");
const entry = resolve(server, "src/index.ts");

function environment() {
  const env = { ...process.env };
  delete env.APP_CONFIG_FILE;
  delete env.APP_CONFIG_DIR;
  return env;
}

async function fixture() {
  const directory = mkdtempSync(resolve(tmpdir(), "clipboard-x-startup-"));
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const origin = `http://127.0.0.1:${reservation.port}`;
  const document = parseDocument(readFileSync(resolve(server, "config.example.yaml"), "utf8"));
  document.setIn(["app", "host"], "127.0.0.1");
  document.setIn(["app", "port"], reservation.port);
  document.setIn(["logger", "console", "enabled"], false);
  document.setIn(["logger", "file", "enabled"], false);
  document.setIn(["security", "password", "memory-cost"], 19456);
  document.setIn(["security", "password", "time-cost"], 2);
  const config = resolve(directory, "config.yaml");
  writeFileSync(config, document.toString());
  await reservation.stop(true);
  return { directory, config, origin, database: resolve(directory, "data/clipboard-x.db") };
}

async function ready(child: Bun.Subprocess, origin: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited with code ${child.exitCode}`);
    const response = await fetch(`${origin}/health/ready`, { signal: AbortSignal.timeout(500) }).catch(() => undefined);
    if (response?.ok) return;
    await Bun.sleep(50);
  }
  throw new Error("Server did not become ready");
}

async function stop(child: Bun.Subprocess | undefined) {
  if (!child) return;
  if (child.exitCode === null) child.kill("SIGKILL");
  await child.exited;
}

function hasDeviceTable(path: string) {
  const database = new SQLite(path, { readonly: true });
  try {
    return database.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'devices'").get() !== null;
  } finally {
    database.close();
  }
}

describe("server startup", () => {
  it("migrates on argument-free startup and accepts --config with --no-migrate on restart", async () => {
    const setup = await fixture();
    let child: Bun.Subprocess | undefined;
    try {
      child = Bun.spawn([process.execPath, entry], {
        cwd: setup.directory, env: environment(), stdout: "ignore", stderr: "ignore",
      });
      await ready(child, setup.origin);
      expect(hasDeviceTable(setup.database)).toBe(true);
      await stop(child);
      child = Bun.spawn([process.execPath, entry, "--config", setup.config, "--no-migrate"], {
        cwd: server, env: environment(), stdout: "ignore", stderr: "ignore",
      });
      await ready(child, setup.origin);
      expect(hasDeviceTable(setup.database)).toBe(true);
    } finally {
      await stop(child);
      rmSync(setup.directory, { recursive: true, force: true });
    }
  }, 15_000);

  it("does not initialize tables with --no-migrate or --healthcheck", async () => {
    const setup = await fixture();
    try {
      for (const option of ["--no-migrate", "--healthcheck"]) {
        const result = spawnSync(process.execPath, [entry, "--config", setup.config, option], {
          cwd: server, env: environment(), encoding: "utf8", timeout: 5_000,
        });
        if (result.error) throw result.error;
        expect(result.status).toBe(1);
        expect(hasDeviceTable(setup.database)).toBe(false);
      }
    } finally {
      rmSync(setup.directory, { recursive: true, force: true });
    }
  }, 15_000);
});
