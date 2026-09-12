import { rm } from "node:fs/promises"

const outputDirectory = new URL("./dist", import.meta.url).pathname
const compile = process.argv.includes("--compile")

await rm(outputDirectory, { recursive: true, force: true })

const result = await Bun.build({
  entrypoints: [new URL("./src/entry/main.ts", import.meta.url).pathname],
  target: "bun",
  minify: true,
  sourcemap: compile ? "none" : "linked",
  ...(compile
    ? { compile: { outfile: `${outputDirectory}/clipboard-x-server` } }
    : { outdir: outputDirectory, naming: "server.js" }),
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

console.log(compile ? "Compiled server executable" : "Built server bundle")
