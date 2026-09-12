import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { Database } from "bun:sqlite"
import migration001 from "../../../migrations/001_initial.sql" with { type: "text" }

export class SqliteDatabase {
  public readonly raw: Database

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.raw = new Database(path, { create: true, strict: true })
    this.raw.exec("PRAGMA foreign_keys = ON")
    this.raw.exec("PRAGMA journal_mode = WAL")
    this.raw.exec("PRAGMA synchronous = NORMAL")
    this.migrate()
  }

  private migrate(): void {
    const version = this.raw.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version ?? 0
    if (version > 1) throw new Error(`Database schema version ${version} is newer than this server`)
    if (version === 0) {
      this.raw.transaction(() => {
        this.raw.exec(migration001)
        this.raw.exec("PRAGMA user_version = 1")
      })()
    }
  }

  close(): void {
    this.raw.close(false)
  }
}
