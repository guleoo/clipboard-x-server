import { readdir, rm, stat } from "node:fs/promises"
import { basename, join } from "node:path"
import { sql } from "drizzle-orm"
import { config } from "../src/config"
import { Database, db } from "../src/db"
import { databaseConfig } from "../src/frame/db"
import { Lifecycle } from "../src/frame/core"
import { objectStore } from "../src/repo/object"
import { sqliteValue } from "../src/common/sqlite"
import { objectCollector } from "../src/service/object-gc"

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

async function audit(): Promise<readonly AuditIssue[]> {
  const rows = sqliteValue(db.all<ObjectRow>(sql`SELECT * FROM objects ORDER BY created_at`))
  const files = await objectStore.files()
  const referencedPaths = new Set(rows.map((row) => row.path))
  const issues: AuditIssue[] = []
  for (const row of rows) {
    const actualSize = await objectStore.size(row.path)
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
    const actualReferences = sqliteValue(db.all<{ count: number }>(sql`
      SELECT (
        (SELECT count(*) FROM representations WHERE object_id = ${row.id}) +
        (SELECT count(*) FROM previews WHERE object_id = ${row.id})
      ) AS count
    `))[0]?.count ?? 0
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

async function garbageCollect(removeFiles: boolean): Promise<void> {
  const cutoff = Date.now() - config.objectGcGraceMillis
  const plan = objectCollector.plan()
  const temporaryDirectory = join(config.objectDirectory, ".tmp")
  const staleParts: string[] = []
  for (const entry of await readdir(temporaryDirectory, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isFile()) continue
    const path = join(temporaryDirectory, entry.name)
    if ((await stat(path)).mtimeMs <= cutoff) staleParts.push(path)
  }
  console.log(JSON.stringify({
    event: "objects.gc.plan",
    mode: removeFiles ? "delete" : "report",
    ...plan,
    temporaryFileCount: staleParts.length,
  }))
  if (!removeFiles) return
  const deletedObjects = objectCollector.collect()
  for (const path of staleParts) await rm(path, { force: true })
  console.log(JSON.stringify({ event: "objects.gc.complete", deletedObjects, deletedTemporaryFiles: staleParts.length }))
}

const command = process.argv[2]
if (!new Set(["audit", "gc"]).has(command ?? "")) {
  console.error("Usage: bun run scripts/objects.ts <audit|gc> [--delete] [--strict]")
  process.exit(1)
}
Database.init()
Database.migrate({ migrationsFolder: databaseConfig.migrationsFolder })
await objectStore.initialize()
try {
  if (command === "audit") {
    const issues = await audit()
    console.log(JSON.stringify({ event: "objects.audit", objectCount: (await objectStore.files()).length, issueCount: issues.length, issues }, null, 2))
    if (issues.length > 0 && process.argv.includes("--strict")) process.exitCode = 2
  } else {
    await garbageCollect(process.argv.includes("--delete"))
  }
} finally {
  await Lifecycle.shutdown({ reason: "manual" })
}
