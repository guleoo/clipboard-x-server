import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database as SQLite } from "bun:sqlite";
import type { Fields } from "../core";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate as runMigrations } from "drizzle-orm/bun-sqlite/migrator";
import type { Logger } from "drizzle-orm/logger";
import { requireSynchronous } from "./transaction";
import type {
  DatabaseClientConfig,
  DbExecutor,
  DriverDatabase,
  RootDatabase,
  SqliteClient,
} from "./type";

export const engine = "sqlite" as const;

type SQLiteFactory = (
  path: string,
  options: {
    readonly create: boolean;
    readonly safeIntegers: boolean;
    readonly strict: boolean;
  },
) => SQLite;

function bindMethod<Method>(method: Method, receiver: object): Method {
  return (method as unknown as { bind(thisArg: object): Method }).bind(receiver);
}

export function createExecutor<Schema extends Fields>(
  raw: DriverDatabase<Schema>,
  inTransaction = false,
): DbExecutor<Schema> {
  let executor: DbExecutor<Schema>;
  executor = Object.freeze({
    query: raw.query,
    select: bindMethod(raw.select, raw),
    insert: bindMethod(raw.insert, raw),
    update: bindMethod(raw.update, raw),
    delete: bindMethod(raw.delete, raw),
    run: bindMethod(raw.run, raw),
    all: bindMethod(raw.all, raw),
    get: bindMethod(raw.get, raw),
    values: bindMethod(raw.values, raw),
    transaction<Result>(callback: (value: DbExecutor<Schema>) => Result) {
      if (inTransaction) return requireSynchronous(callback(executor));
      return (raw as RootDatabase<Schema>).transaction((transaction) =>
        requireSynchronous(callback(createExecutor(transaction, true))),
      ) as Result;
    },
  });
  return executor;
}

export function createSqliteClient<Schema extends Fields>(
  config: DatabaseClientConfig,
  schema: Schema,
  logger: Logger,
  createSQLite: SQLiteFactory = (path, options) => new SQLite(path, options),
): SqliteClient<Schema> {
  const path = config.url === ":memory:" ? config.url : resolve(config.url);
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const client = createSQLite(path, {
    create: true,
    safeIntegers: true,
    strict: true,
  });

  try {
    client.exec("PRAGMA foreign_keys = ON");
    client.exec(`PRAGMA busy_timeout = ${config.busyTimeoutMillis}`);
    if (path !== ":memory:" && config.wal) {
      client.exec("PRAGMA journal_mode = WAL");
    }

    const database = drizzle({ client, schema, logger });
    const executor = createExecutor(database);

    return {
      name: config.name,
      engine,
      executor,
      raw: client,
      check() {
        client.query("select 1").get();
      },
      migrate(options) {
        runMigrations(database, options);
      },
      close() {
        client.close(false);
      },
    };
  } catch (error) {
    try {
      client.close(false);
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "SQLite database creation and cleanup failed",
      );
    }
    throw error;
  }
}
