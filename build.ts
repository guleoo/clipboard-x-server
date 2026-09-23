import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const compile = process.argv.includes("--compile")
const archive = process.argv.includes("--archive")
const root = import.meta.dir
const executableName = process.platform === "win32" ? "clipboard-x-server.exe" : "clipboard-x-server"

if (archive && !compile) throw new Error("Release archives require --compile")

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
  compile ? `${root}/server/dist/${executableName}` : `${root}/server/dist/server.js`,
  compile ? `${release}/${executableName}` : `${release}/server.js`,
)
await cp(`${root}/server/drizzle`, `${release}/server/drizzle`, { recursive: true })
await cp(`${root}/server/config.example.yaml`, `${release}/server/config.example.yaml`)
await cp(`${root}/server/openapi/openapi.json`, `${release}/server/openapi/openapi.json`)
await cp(`${root}/docs`, `${release}/docs`, { recursive: true })
await cp(`${root}/README.md`, `${release}/README.md`)
await cp(`${root}/LICENSE.md`, `${release}/LICENSE.md`)

console.log(`Release assembled in ${release}`)

if (archive) {
  const { version } = (await Bun.file(`${root}/package.json`).json()) as { version: string }
  const name = `clipboard-x-server-v${version}-${process.platform}-${process.arch}`
  const output = `${root}/release/${name}.tar.gz`
  const temporaryOutput = `${output}.tmp`
  const staging = await mkdtemp(join(tmpdir(), "clipboard-x-release-"))
  await mkdir(`${root}/release`, { recursive: true })
  try {
    await cp(release, join(staging, name), { recursive: true })
    await run(["tar", "-czf", temporaryOutput, "-C", staging, name])
    await rename(temporaryOutput, output)
  } finally {
    await rm(temporaryOutput, { force: true })
    await rm(staging, { recursive: true, force: true })
  }
  console.log(`Release archive: ${output}`)
}
