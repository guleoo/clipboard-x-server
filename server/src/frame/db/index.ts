import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database as SQLite } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate as migrateDatabase } from "drizzle-orm/bun-sqlite/migrator";
import type { MigrationConfig } from "drizzle-orm/migrator";
import { AsyncStore, BaseError, Lifecycle, type Fields } from "../core";

export interface DatabaseOptions<Schema extends Fields> {
  readonly url: string;
  readonly schema: Schema;
  readonly busyTimeoutMillis?: number;
  readonly wal?: boolean;
}

export class DatabaseError extends BaseError {}

type RootDatabase<Schema extends Fields> = ReturnType<typeof drizzle<Schema>>;
type Transaction<Schema extends Fields> = Parameters<
  Parameters<RootDatabase<Schema>["transaction"]>[0]
>[0];
export type DbExecutor<Schema extends Fields = Fields> =
  | RootDatabase<Schema>
  | Transaction<Schema>;

export interface DatabaseTransactionContext {
  readonly executor: DbExecutor;
}

export const DatabaseTransactionStore =
  AsyncStore.context<DatabaseTransactionContext>({
    key: "DatabaseTransactionContext",
    unique: false,
  });

let rootDatabase: RootDatabase<Fields> | undefined;
let sqliteClient: SQLite | undefined;
let unregisterLifecycle: (() => void) | undefined;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function requireRoot<Schema extends Fields>(): RootDatabase<Schema> {
  if (!rootDatabase) throw new DatabaseError("Database is not initialized");
  return rootDatabase as RootDatabase<Schema>;
}

function requireSync<Result>(value: Result): Result {
  if (isThenable(value)) {
    throw new DatabaseError(
      "SQLite transaction callbacks must be synchronous and must not return a Promise",
    );
  }
  return value;
}

export function initDatabase<Schema extends Fields>(
  options: DatabaseOptions<Schema>,
): void {
  if (rootDatabase) throw new DatabaseError("Database is already initialized");
  const path = options.url === ":memory:" ? options.url : resolve(options.url);
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const client = new SQLite(path, { create: true, strict: true });
  try {
    client.exec("PRAGMA foreign_keys = ON");
    client.exec(`PRAGMA busy_timeout = ${options.busyTimeoutMillis ?? 5_000}`);
    if (path !== ":memory:" && (options.wal ?? true)) {
      client.exec("PRAGMA journal_mode = WAL");
    }
    const database = drizzle({ client, schema: options.schema });
    unregisterLifecycle = Lifecycle.register({
      name: "sqlite",
      on: "shutdown",
      phase: "dispose",
      order: 10,
      event: () => Database.close(),
    });
    sqliteClient = client;
    rootDatabase = database as RootDatabase<Fields>;
  } catch (error) {
    client.close(false);
    throw error;
  }
}

export namespace Database {
  export function initialized(): boolean {
    return rootDatabase !== undefined;
  }

  export function root<Schema extends Fields = Fields>(): RootDatabase<Schema> {
    return requireRoot<Schema>();
  }

  export function active<Schema extends Fields = Fields>():
    | DbExecutor<Schema>
    | undefined {
    return DatabaseTransactionStore.get("executor") as
      | DbExecutor<Schema>
      | undefined;
  }

  export function current<Schema extends Fields = Fields>(): DbExecutor<Schema> {
    return active<Schema>() ?? root<Schema>();
  }

  export function transaction<Result>(
    callback: (executor: DbExecutor) => Result,
  ): Result {
    const activeExecutor = active();
    if (activeExecutor) return requireSync(callback(activeExecutor));
    return root().transaction((transaction) =>
      DatabaseTransactionStore.run(
        { executor: transaction as DbExecutor },
        () => requireSync(callback(transaction as DbExecutor)),
      ),
    ) as Result;
  }

  export function migrate(config: MigrationConfig): void {
    migrateDatabase(root(), config);
  }

  export function check(): void {
    if (!sqliteClient) throw new DatabaseError("Database is not initialized");
    sqliteClient.query("select 1").get();
  }

  export function close(): void {
    const client = sqliteClient;
    if (!client) return;
    sqliteClient = undefined;
    rootDatabase = undefined;
    unregisterLifecycle?.();
    unregisterLifecycle = undefined;
    client.close(false);
  }
}

function call(method: string, values: IArguments | readonly unknown[]): unknown {
  const executor = Database.current() as unknown as Record<
    string,
    (...args: unknown[]) => unknown
  >;
  return executor[method]!(...Array.from(values));
}

export type DbFacade<Schema extends Fields = Fields> = Pick<
  RootDatabase<Schema>,
  "query" | "select" | "insert" | "update" | "delete" | "run" | "all" | "get" | "values"
> & {
  transaction<Result>(callback: (executor: DbExecutor<Schema>) => Result): Result;
  raw(): DbExecutor<Schema>;
};

export const db: DbFacade = {
  get query() {
    return Database.current().query;
  },
  select() {
    return call("select", arguments) as never;
  },
  insert() {
    return call("insert", arguments) as never;
  },
  update() {
    return call("update", arguments) as never;
  },
  delete() {
    return call("delete", arguments) as never;
  },
  run() {
    return call("run", arguments) as never;
  },
  all() {
    return call("all", arguments) as never;
  },
  get() {
    return call("get", arguments) as never;
  },
  values() {
    return call("values", arguments) as never;
  },
  transaction(callback) {
    return Database.transaction(callback as (executor: DbExecutor) => unknown) as never;
  },
  raw() {
    return Database.current();
  },
};
