import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = resolve(root, "dist", process.platform === "win32" ? "clipboard-x-server.exe" : "clipboard-x-server");
const configuration = resolve(root, "dist/server/config.example.yaml");
const child = Bun.spawn([executable, "--config", configuration, "--migrate"], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
});

const code = await child.exited;
if (code !== 0) throw new Error(`Release executable migration smoke test failed with exit code ${code}`);
