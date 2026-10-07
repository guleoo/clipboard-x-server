import { rm } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { compileTargets, executableName, releaseTarget } from "../scripts/release"

const outputDirectory = fileURLToPath(new URL("./dist", import.meta.url))
const entrypoint = fileURLToPath(new URL("./src/index.ts", import.meta.url))
const compile = process.argv.includes("--compile")
const target = compile ? releaseTarget(process.platform, process.arch, process.env.CBX_RELEASE_TARGET) : undefined

await rm(outputDirectory, { recursive: true, force: true })

if (compile) {
  // Bun 1.3.14's API compiler misidentifies import.meta.main on Windows; the CLI folds it correctly.
  const child = Bun.spawn([
    process.execPath, "build", entrypoint, "--compile", "--minify",
    `--target=${compileTargets[target!]}`,
    "--outfile", `${outputDirectory}/${executableName(target!)}`,
  ], { stdout: "inherit", stderr: "inherit" })
  const code = await child.exited
  if (code !== 0) process.exit(code)
} else {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    target: "bun",
    minify: true,
    sourcemap: "linked",
    outdir: outputDirectory,
    naming: "server.js",
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
}

console.log(compile ? "Compiled server executable" : "Built server bundle")
