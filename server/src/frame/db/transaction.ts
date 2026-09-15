import type { Fields } from "../core";
import { AsyncStore } from "../core";
import { databaseError } from "./error";
import type { DbExecutor } from "./type";

interface DatabaseTransactionContext {
  readonly executors: ReadonlyMap<object, DbExecutor>;
}

const TransactionStore = AsyncStore.context<DatabaseTransactionContext>({
  key: "DatabaseRuntimeTransactionContext",
  unique: false,
});

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function requireSynchronous<Result>(value: Result): Result {
  if (isThenable(value)) {
    throw databaseError(
      "SQLite transaction callbacks must be synchronous and must not return a Promise",
    );
  }
  return value;
}

export function activeExecutor<Schema extends Fields>(
  owner: object,
): DbExecutor<Schema> | undefined {
  return TransactionStore.get("executors")?.get(owner) as
    | DbExecutor<Schema>
    | undefined;
}

export function runWithExecutor<Schema extends Fields, Result>(
  owner: object,
  executor: DbExecutor<Schema>,
  callback: () => Result,
): Result {
  const executors = new Map(TransactionStore.get("executors"));
  executors.set(owner, executor as DbExecutor);
  return TransactionStore.run({ executors }, () =>
    requireSynchronous(callback()),
  );
}
