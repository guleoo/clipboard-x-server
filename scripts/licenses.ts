import { resolve } from "node:path"

interface PackageManifest {
  readonly name: string
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
  readonly license?: string | { readonly type?: string }
}

const root = resolve(import.meta.dir, "..")
const workspaceFiles = ["server/package.json", "web/package.json"]
const dependencies = new Map<string, { requested: string; scopes: Set<string> }>()

for (const file of workspaceFiles) {
  const manifest = await Bun.file(resolve(root, file)).json() as PackageManifest
  for (const [scope, values] of [["runtime", manifest.dependencies], ["development", manifest.devDependencies]] as const) {
    for (const [name, requested] of Object.entries(values ?? {})) {
      const current = dependencies.get(name) ?? { requested, scopes: new Set<string>() }
      current.scopes.add(scope)
      dependencies.set(name, current)
    }
  }
}

const report: Array<Readonly<Record<string, unknown>>> = []
let incomplete = false
for (const [name, declaration] of [...dependencies].sort(([left], [right]) => left.localeCompare(right))) {
  const candidates = workspaceFiles.flatMap((file) => [
    resolve(root, file, "../node_modules", name, "package.json"),
    resolve(root, "node_modules", name, "package.json"),
  ])
  const path = candidates.find((candidate) => Bun.file(candidate).size > 0)
  if (!path) {
    report.push({ name, requested: declaration.requested, scopes: [...declaration.scopes], error: "package manifest not found" })
    incomplete = true
    continue
  }
  const installed = await Bun.file(path).json() as PackageManifest & { readonly version?: string }
  const license = typeof installed.license === "string" ? installed.license : installed.license?.type
  if (!license) incomplete = true
  report.push({
    name,
    requested: declaration.requested,
    installed: installed.version ?? "unknown",
    license: license ?? "UNKNOWN",
    scopes: [...declaration.scopes].sort(),
  })
}

console.log(JSON.stringify({ event: "dependencies.licenses", packages: report.length, incomplete, report }, null, 2))
if (incomplete) process.exitCode = 2
