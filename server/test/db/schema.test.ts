import { expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { sqliteValue } from "../../src/common/sqlite";
import { dbSchema, metadata } from "../../src/db/schema";
import { createDatabase, databaseConfig } from "../../src/frame/db";

it("initializes the current schema on a fresh database and preserves data on repeated migration", () => {
  const database = createDatabase({ schema: dbSchema, url: ":memory:" });
  database.control.init();
  try {
    database.control.migrate({ migrationsFolder: databaseConfig.migrationsFolder });
    for (const table of Object.values(dbSchema)) {
      const definition = getTableConfig(table);
      const columns = sqliteValue(database.db.all<{ name: string }>(
        sql.raw(`PRAGMA table_info("${definition.name}")`),
      ));
      expect(columns.map(({ name }) => name)).toEqual(definition.columns.map(({ name }) => name));
      const indexes = sqliteValue(database.db.all<{ name: string }>(
        sql.raw(`PRAGMA index_list("${definition.name}")`),
      ));
      for (const index of definition.indexes) {
        expect(indexes.some(({ name }) => name === index.config.name)).toBe(true);
      }
    }
    database.db.insert(metadata).values({ key: "initialization", value: "preserved" }).run();
    database.control.migrate({ migrationsFolder: databaseConfig.migrationsFolder });
    expect(database.db.select().from(metadata).all()).toEqual([
      { key: "initialization", value: "preserved" },
    ]);
  } finally {
    database.control.close();
  }
});
