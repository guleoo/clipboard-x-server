import { resolve } from "node:path"
import { configPath } from "../src/frame/config"

const projectDirectory = resolve(import.meta.dir, "../..")
const serverDirectory = resolve(projectDirectory, "server")

const migration = Bun.spawn([
  "bun",
  "run",
  "scripts/db/migrate.ts",
  "--config",
  configPath,
], {
  cwd: serverDirectory,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})
const migrationExitCode = await migration.exited
if (migrationExitCode !== 0) process.exit(migrationExitCode)

const server = Bun.spawn([
  "bun",
  "--hot",
  "src/index.ts",
  "--config",
  configPath,
], {
  cwd: serverDirectory,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})
const web = Bun.spawn(["bun", "run", "dev"], {
  cwd: resolve(projectDirectory, "web"),
  env: process.env,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

let stopping = false
function stop(signal: NodeJS.Signals): void {
  if (stopping) return
  stopping = true
  server.kill(signal)
  web.kill(signal)
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => stop(signal))
}

const exitCode = await Promise.race([server.exited, web.exited])
stop("SIGTERM")
await Promise.allSettled([server.exited, web.exited])
process.exitCode = exitCode
