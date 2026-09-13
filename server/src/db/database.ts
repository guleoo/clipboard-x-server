import type { SQL } from "drizzle-orm"
import type { ServerConfig } from "../config"
import {
  Database,
  initDatabase,
  type DbExecutor,
} from "../frame/db"
import * as schema from "./schema"

export type ApplicationDatabaseExecutor = DbExecutor<typeof schema>
export type ApplicationDatabaseClient = ReturnType<typeof Database.root<typeof schema>>
export type ApplicationDatabaseTransaction = Exclude<
  ApplicationDatabaseExecutor,
  ApplicationDatabaseClient
>

export class ApplicationDatabase {
  constructor(config: Pick<ServerConfig, "databasePath" | "databaseBusyTimeoutMs" | "databaseWal">) {
    initDatabase({
      url: config.databasePath,
      schema,
      busyTimeoutMillis: config.databaseBusyTimeoutMs,
      wal: config.databaseWal,
    })
    Database.root<typeof schema>().run("PRAGMA synchronous = NORMAL")
  }

  get current(): ApplicationDatabaseExecutor {
    return Database.current<typeof schema>()
  }

  first<Row>(query: SQL): Row | undefined {
    return this.current.all<Row>(query)[0]
  }

  transaction<Result>(callback: () => Result): Result {
    return Database.transaction(callback)
  }

  migrate(migrationsFolder: string): void {
    Database.migrate({ migrationsFolder })
  }

  check(): void {
    Database.check()
  }

  close(): void {
    Database.close()
  }
}

export function migrateApplicationDatabase(config: ServerConfig): void {
  const database = new ApplicationDatabase(config)
  try {
    database.migrate(config.migrationsDirectory)
  } finally {
    database.close()
  }
}
