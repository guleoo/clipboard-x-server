import type { Fields } from "../core";
import type { DbExecutor, DbFacade } from "./type";

type Callable = (...args: unknown[]) => unknown;

function forward<Schema extends Fields, Key extends keyof DbExecutor<Schema>>(
  current: () => DbExecutor<Schema>,
  key: Key,
): DbExecutor<Schema>[Key] {
  const method = (...args: unknown[]) => {
    const executor = current();
    return (executor[key] as Callable).apply(executor, args);
  };
  return method as DbExecutor<Schema>[Key];
}

export function createDbFacade<Schema extends Fields>(
  current: () => DbExecutor<Schema>,
  transaction: DbExecutor<Schema>["transaction"],
): DbFacade<Schema> {
  return Object.freeze({
    get query() {
      return current().query;
    },
    select: forward(current, "select"),
    insert: forward(current, "insert"),
    update: forward(current, "update"),
    delete: forward(current, "delete"),
    run: forward(current, "run"),
    all: forward(current, "all"),
    get: forward(current, "get"),
    values: forward(current, "values"),
    transaction,
  });
}
