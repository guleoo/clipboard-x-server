import { readdir, rm, stat } from "node:fs/promises"
import { basename, join } from "node:path"
import { Application } from "../src/application"
import { loadConfig } from "../src/entry/config"

interface ObjectRow {
  readonly id: string
  readonly sha256: string
  readonly size: number
  readonly path: string
  readonly ref_count: number
  readonly created_at: number
}

interface AuditIssue {
  readonly code: string
  readonly object: string
  readonly detail: string
}

async function fileDigest(path: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256")
  const reader = Bun.file(path).stream().getReader()
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      hash.update(part.value)
    }
    return hash.digest("hex")
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

async function audit(application: Application): Promise<readonly AuditIssue[]> {
  const rows = application.database.raw.query<ObjectRow, []>("SELECT * FROM objects ORDER BY created_at").all()
  const files = await application.objects.files()
  const referencedPaths = new Set(rows.map((row) => row.path))
  const issues: AuditIssue[] = []
  for (const row of rows) {
    const actualSize = await application.objects.size(row.path)
    if (actualSize === undefined) {
      issues.push({ code: "missing_file", object: row.sha256, detail: "metadata exists but the object file is missing" })
      continue
    }
    if (actualSize !== row.size) {
      issues.push({ code: "size_mismatch", object: row.sha256, detail: `expected ${row.size}, found ${actualSize}` })
      continue
    }
    if (await fileDigest(row.path) !== row.sha256) {
      issues.push({ code: "hash_mismatch", object: row.sha256, detail: "stored bytes do not match the content address" })
    }
    const actualReferences = Number(application.database.raw.query<{ count: number }, [string, string]>(
      `SELECT (
        (SELECT count(*) FROM representations WHERE object_id = ?) +
        (SELECT count(*) FROM previews WHERE object_id = ?)
      ) AS count`,
    ).get(row.id, row.id)?.count ?? 0)
    if (actualReferences !== row.ref_count) {
      issues.push({ code: "ref_count_mismatch", object: row.sha256, detail: `metadata ${row.ref_count}, actual ${actualReferences}` })
    }
  }
  for (const path of files) {
    if (!referencedPaths.has(path)) {
      issues.push({ code: "untracked_file", object: basename(path), detail: "object file has no database metadata" })
    }
  }
  return issues
}

async function garbageCollect(application: Application, removeFiles: boolean): Promise<void> {
  const cutoff = Date.now() - application.config.objectGcGraceMs
  const rows = application.database.raw.query<ObjectRow, [number]>(
    "SELECT * FROM objects WHERE ref_count = 0 AND created_at <= ? ORDER BY created_at",
  ).all(cutoff)
  const temporaryDirectory = join(application.config.objectDirectory, ".tmp")
  const staleParts: string[] = []
  for (const entry of await readdir(temporaryDirectory, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile()) continue
    const path = join(temporaryDirectory, entry.name)
    if ((await stat(path)).mtimeMs <= cutoff) staleParts.push(path)
  }
  console.log(JSON.stringify({
    event: "objects.gc.plan",
    mode: removeFiles ? "delete" : "report",
    objectCount: rows.length,
    objectBytes: rows.reduce((sum, row) => sum + row.size, 0),
    temporaryFileCount: staleParts.length,
  }))
  if (!removeFiles) return
  for (const row of rows) {
    const result = application.database.raw.query("DELETE FROM objects WHERE id = ? AND ref_count = 0").run(row.id)
    if (result.changes > 0) await rm(row.path, { force: true })
  }
  for (const path of staleParts) await rm(path, { force: true })
  console.log(JSON.stringify({ event: "objects.gc.complete", deletedObjects: rows.length, deletedTemporaryFiles: staleParts.length }))
}

const command = process.argv[2]
if (!new Set(["audit", "gc"]).has(command ?? "")) {
  console.error("Usage: bun run scripts/objects.ts <audit|gc> [--delete] [--strict]")
  process.exit(1)
}
const application = await Application.create(loadConfig())
try {
  if (command === "audit") {
    const issues = await audit(application)
    console.log(JSON.stringify({ event: "objects.audit", objectCount: (await application.objects.files()).length, issueCount: issues.length, issues }, null, 2))
    if (issues.length > 0 && process.argv.includes("--strict")) process.exitCode = 2
  } else {
    await garbageCollect(application, process.argv.includes("--delete"))
  }
} finally {
  application.close()
}
