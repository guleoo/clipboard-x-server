import { rm } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { compileTargets, executableName, releaseTarget } from "../scripts/release"

const outputDirectory = fileURLToPath(new URL("./dist", import.meta.url))
const compile = process.argv.includes("--compile")
const target = compile ? releaseTarget(process.platform, process.arch, process.env.CBX_RELEASE_TARGET) : undefined

await rm(outputDirectory, { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: [fileURLToPath(new URL("./src/index.ts", import.meta.url))],
  target: "bun",
  minify: true,
  sourcemap: compile ? "none" : "linked",
  ...(compile
    ? { compile: { target: compileTargets[target!], outfile: `${outputDirectory}/${executableName(target!)}` } }
    : { outdir: outputDirectory, naming: "server.js" }),
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

console.log(compile ? "Compiled server executable" : "Built server bundle")
