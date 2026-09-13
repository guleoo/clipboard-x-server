import { afterEach, describe, expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { ApplicationDatabase } from "../src/db"

const databases: ApplicationDatabase[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

describe("application database", () => {
  test("single-row SQL reads preserve named columns", () => {
    const database = new ApplicationDatabase({
      databasePath: ":memory:",
      databaseBusyTimeoutMs: 5_000,
      databaseWal: false,
    })
    databases.push(database)
    database.current.run(sql`CREATE TABLE example(id TEXT PRIMARY KEY, value INTEGER NOT NULL)`)
    database.current.run(sql`INSERT INTO example(id, value) VALUES (${"row"}, ${42})`)

    expect(database.first<{ id: string; value: number }>(sql`
      SELECT id, value FROM example WHERE id = ${"row"}
    `)).toEqual({ id: "row", value: 42 })
  })
})
