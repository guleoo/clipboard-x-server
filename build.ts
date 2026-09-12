import { cp, mkdir, rm } from "node:fs/promises"

const compile = process.argv.includes("--compile")
const root = import.meta.dir

async function run(command: readonly string[]): Promise<void> {
  const process = Bun.spawn(command, { cwd: root, stdout: "inherit", stderr: "inherit" })
  const code = await process.exited
  if (code !== 0) throw new Error(`Command failed (${code}): ${command.join(" ")}`)
}

await run(["bun", "run", "openapi:check"])
await run(["bun", "run", "--filter", "@clipboard-x/web", "build"])
await run(["bun", "run", "--filter", "@clipboard-x/server", compile ? "compile" : "build"])

const release = `${root}/dist`
await rm(release, { recursive: true, force: true })
await mkdir(release, { recursive: true })
await cp(`${root}/web/dist`, `${release}/web/dist`, { recursive: true })
await cp(
  compile ? `${root}/server/dist/clipboard-x-server` : `${root}/server/dist/server.js`,
  compile ? `${release}/clipboard-x-server` : `${release}/server.js`,
)
await cp(`${root}/server/migrations`, `${release}/migrations`, { recursive: true })
await cp(`${root}/config.example.yaml`, `${release}/config.example.yaml`)

console.log(`Release assembled in ${release}`)
