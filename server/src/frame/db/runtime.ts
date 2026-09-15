import type { Fields } from "../core";
import { databaseConfig } from "./config";
import { createSqliteClient, engine } from "./driver";
import { databaseError } from "./error";
import { createDbFacade } from "./facade";
import { drizzleLogger } from "./logger";
import {
  activeExecutor,
  requireSynchronous,
  runWithExecutor,
} from "./transaction";
import type {
  CreateDatabaseOptions,
  DatabaseControl,
  DatabaseInstance,
  DatabaseMigrationOptions,
  DatabaseState,
  DbExecutor,
  SqliteClient,
} from "./type";

function stateError(name: string, operation: string, state: DatabaseState) {
  return databaseError(
    `Database "${name}" cannot ${operation} while state is "${state}"`,
  );
}

export function createDatabase<Schema extends Fields>(
  options: CreateDatabaseOptions<Schema>,
): DatabaseInstance<Schema> {
  const config = databaseConfig;
  const owner = Object.freeze({ name: config.name });
  let state: DatabaseState = "created";
  let client: SqliteClient<Schema> | undefined;

  function readyClient(operation: string): SqliteClient<Schema> {
    if (state !== "ready" || !client) {
      throw stateError(config.name, operation, state);
    }
    return client;
  }

  function currentExecutor(): DbExecutor<Schema> {
    return (
      activeExecutor<Schema>(owner) ?? readyClient("execute queries").executor
    );
  }

  function transaction<Result>(
    callback: (executor: DbExecutor<Schema>) => Result,
  ): Result {
    const active = activeExecutor<Schema>(owner);
    if (active) return requireSynchronous(callback(active));

    return readyClient("start a transaction").executor.transaction(
      (transactionExecutor) =>
        runWithExecutor(owner, transactionExecutor, () =>
          callback(transactionExecutor),
        ),
    );
  }

  const db = createDbFacade(currentExecutor, transaction);

  const control: DatabaseControl = Object.freeze({
    init() {
      if (state === "ready") return;
      if (state !== "created") {
        throw stateError(config.name, "initialize", state);
      }

      state = "initializing";
      let candidate: SqliteClient<Schema> | undefined;
      try {
        candidate = createSqliteClient(
          config,
          options.schema,
          drizzleLogger,
        );
        candidate.check();
        client = candidate;
        state = "ready";
      } catch (error) {
        let cause = error;
        if (candidate) {
          try {
            candidate.close();
          } catch (closeError) {
            client = candidate;
            cause = new AggregateError(
              [error, closeError],
              "Database initialization and cleanup failed",
            );
          }
        }
        state = "failed";
        throw databaseError(
          `Database "${config.name}" initialization failed`,
          cause,
        );
      }
    },
    check() {
      const current = readyClient("check health");
      try {
        current.check();
      } catch (error) {
        throw databaseError(`Database "${config.name}" health check failed`, error);
      }
    },
    migrate(migrationOptions: DatabaseMigrationOptions) {
      const current = readyClient("run migrations");
      try {
        current.migrate(migrationOptions);
      } catch (error) {
        throw databaseError(`Database "${config.name}" migration failed`, error);
      }
    },
    close() {
      if (state === "closed") return;
      const current = client;
      if (!current) {
        state = "closed";
        return;
      }

      state = "closing";
      try {
        current.close();
        if (client === current) client = undefined;
        state = "closed";
      } catch (error) {
        state = "failed";
        throw databaseError(`Database "${config.name}" close failed`, error);
      }
    },
    inspect() {
      return Object.freeze({ name: config.name, engine, state });
    },
  });

  return Object.freeze({ db, control });
}
