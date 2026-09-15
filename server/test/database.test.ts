import { describe, expect, it } from "bun:test";
import type { Database as SQLite } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { createSqliteClient } from "../src/frame/db/driver";
import { createDatabase, DbError, mergeSchema } from "../src/frame/db";

describe("database runtime", () => {
  it("opens lazily and governs state transitions", () => {
    const database = createDatabase({ schema: {} });

    expect(database.control.inspect()).toMatchObject({
      engine: "sqlite",
      state: "created",
    });
    expect(() => database.db.get(sql.raw("select 1"))).toThrow(DbError);

    database.control.init();
    expect(database.control.inspect().state).toBe("ready");
    database.control.check();
    database.control.close();
    expect(database.control.inspect().state).toBe("closed");
    expect(() => database.control.init()).toThrow(DbError);
  });

  it("uses required nested transactions and rolls back synchronous failures", () => {
    const database = createDatabase({ schema: {} });
    database.control.init();
    database.db.run(
      sql.raw("create table transaction_contract (id integer primary key)"),
    );

    expect(() =>
      database.db.transaction((outer) => {
        database.db.run(
          sql.raw("insert into transaction_contract(id) values (1)"),
        );
        database.db.transaction((inner) => {
          expect(inner).toBe(outer);
          expect(
            database.db.get(
              sql.raw("select id from transaction_contract"),
            ) as unknown,
          ).toEqual([1n]);
        });
        throw new Error("rollback");
      }),
    ).toThrow("rollback");

    expect(
      database.db.all(sql.raw("select id from transaction_contract")),
    ).toEqual([]);
    expect(() => database.db.transaction(async () => undefined)).toThrow(
      "must not return a Promise",
    );
    database.control.close();
  });

  it("isolates active executors across database instances", () => {
    const first = createDatabase({ schema: {} });
    const second = createDatabase({ schema: {} });
    first.control.init();
    second.control.init();
    first.db.run(sql.raw("create table probe (value text not null)"));
    second.db.run(sql.raw("create table probe (value text not null)"));
    second.db.run(sql.raw("insert into probe(value) values ('second')"));

    first.db.transaction(() => {
      first.db.run(sql.raw("insert into probe(value) values ('first')"));
      expect(
        second.db.get(sql.raw("select value from probe")) as unknown,
      ).toEqual(["second"]);
    });

    first.control.close();
    second.control.close();
  });

  it("preserves both adapter and cleanup failures", () => {
    const createError = new Error("adapter failed");
    const closeError = new Error("cleanup failed");
    const client = {
      exec() {
        throw createError;
      },
      close() {
        throw closeError;
      },
    } as unknown as SQLite;

    try {
      createSqliteClient(
        {
          name: "failure-test",
          url: ":memory:",
          busyTimeoutMillis: 1_000,
          wal: false,
        },
        {},
        { logQuery() {} },
        () => client,
      );
      throw new Error("Expected createSqliteClient to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([
        createError,
        closeError,
      ]);
    }
  });
});

describe("database schema", () => {
  it("merges schemas without Object prototype collisions", () => {
    const special = Object.create(null) as Record<string, number>;
    Object.defineProperty(special, "constructor", {
      value: 1,
      enumerable: true,
    });
    Object.defineProperty(special, "__proto__", {
      value: 2,
      enumerable: true,
    });

    const merged = mergeSchema(special);
    expect(Reflect.get(merged, "constructor")).toBe(1);
    expect(Reflect.get(merged, "__proto__")).toBe(2);
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    expect(() => mergeSchema(special, { constructor: 3 })).toThrow(DbError);
  });
});
