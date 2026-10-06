import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { executableName, releaseName, releaseTag, releaseTarget } from "./scripts/release"
import { parseDocument } from "yaml"

const compile = process.argv.includes("--compile")
const archive = process.argv.includes("--archive")
const root = import.meta.dir
const target = compile ? releaseTarget(process.platform, process.arch, process.env.CBX_RELEASE_TARGET) : undefined
const binaryName = target ? executableName(target) : "server.js"

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
await cp(`${root}/web/dist`, `${release}/web`, { recursive: true })
await cp(
  compile ? `${root}/server/dist/${binaryName}` : `${root}/server/dist/server.js`,
  compile ? `${release}/${binaryName}` : `${release}/server.js`,
)
await cp(`${root}/server/drizzle`, `${release}/drizzle`, { recursive: true })
const configuration = parseDocument(await readFile(`${root}/server/config.example.yaml`, "utf8"))
configuration.setIn(["web", "root"], "./web")
await writeFile(`${release}/config.example.yaml`, configuration.toString())
await cp(`${root}/server/openapi`, `${release}/openapi`, { recursive: true })
await cp(`${root}/docs`, `${release}/docs`, { recursive: true })
await cp(`${root}/web/docs`, `${release}/docs/web`, { recursive: true })
await cp(`${root}/README.md`, `${release}/README.md`)
await cp(`${root}/README_CN.md`, `${release}/README_CN.md`)
await cp(`${root}/LICENSE.md`, `${release}/LICENSE.md`)

// Local OpenAPI links differ between the source checkout and the native package.
for (const path of ["README.md", "README_CN.md", "docs/protocol.md", "docs/protocol_CN.md"]) {
  const document = await readFile(`${release}/${path}`, "utf8")
  await writeFile(`${release}/${path}`, document
    .replaceAll("(server/openapi/openapi.json)", "(openapi/openapi.json)")
    .replaceAll("(../server/openapi/openapi.json)", "(../openapi/openapi.json)"))
}

console.log(`Release assembled in ${release}`)

if (archive) {
  const { version } = (await Bun.file(`${root}/package.json`).json()) as { version: string }
  const name = releaseName(releaseTag(version, process.env.CBX_RELEASE_TAG), target!)
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
