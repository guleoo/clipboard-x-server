import type { Database as SQLite } from "bun:sqlite";
import type { Fields } from "../core";
import type { drizzle } from "drizzle-orm/bun-sqlite";
import type { MigrationConfig } from "drizzle-orm/migrator";
import type { DatabaseConfig } from "./config";

export type RootDatabase<Schema extends Fields = Fields> = ReturnType<
  typeof drizzle<Schema>
>;

export type Transaction<Schema extends Fields = Fields> = Parameters<
  Parameters<RootDatabase<Schema>["transaction"]>[0]
>[0];

export type DriverDatabase<Schema extends Fields = Fields> =
  | RootDatabase<Schema>
  | Transaction<Schema>;

type ExecutorMethods<Schema extends Fields> = Pick<
  RootDatabase<Schema>,
  | "query"
  | "select"
  | "insert"
  | "update"
  | "delete"
  | "run"
  | "all"
  | "get"
  | "values"
>;

export type DbExecutor<Schema extends Fields = Fields> =
  ExecutorMethods<Schema> & {
    transaction<Result>(
      callback: (executor: DbExecutor<Schema>) => Result,
    ): Result;
  };

export type DbFacade<Schema extends Fields = Fields> = DbExecutor<Schema>;

export interface CreateDatabaseOptions<Schema extends Fields = Fields> {
  readonly schema: Schema;
  readonly url?: string;
}

export type DatabaseMigrationOptions = MigrationConfig;

export type DatabaseState =
  | "created"
  | "initializing"
  | "ready"
  | "closing"
  | "closed"
  | "failed";

export interface DatabaseInspection {
  readonly name: string;
  readonly engine: "sqlite";
  readonly state: DatabaseState;
}

export interface DatabaseControl {
  init(): void;
  check(): void;
  migrate(options: DatabaseMigrationOptions): void;
  close(): void;
  inspect(): DatabaseInspection;
}

export interface DatabaseInstance<Schema extends Fields = Fields> {
  readonly db: DbFacade<Schema>;
  readonly control: DatabaseControl;
}

export interface SqliteClient<Schema extends Fields = Fields> {
  readonly name: string;
  readonly engine: "sqlite";
  readonly executor: DbExecutor<Schema>;
  readonly raw: SQLite;
  check(): void;
  migrate(options: DatabaseMigrationOptions): void;
  close(): void;
}

export type DatabaseClientConfig = Pick<
  DatabaseConfig,
  "name" | "url" | "busyTimeoutMillis" | "wal"
>;
