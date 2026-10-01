import { beforeAll, describe, expect, it } from "bun:test";
import { sql } from "drizzle-orm";
import { Database, db } from "../../src/db";
describe("product SQLite transactions", () => {
  beforeAll(() => Database.init());
  it("rolls back a synchronous SQLite transaction", () => {
    db.run(
      sql.raw(
        "create table if not exists transaction_probe (id integer primary key)",
      ),
    );
    db.run(sql.raw("delete from transaction_probe"));

    expect(() =>
      db.transaction(() => {
        db.run(
          sql.raw("insert into transaction_probe(id) values (1)"),
        );
        throw new Error("rollback");
      }),
    ).toThrow("rollback");

    expect(db.all(sql.raw("select id from transaction_probe"))).toEqual(
      [],
    );
  });

  it("rejects asynchronous SQLite transaction callbacks at runtime", () => {
    expect(() => db.transaction(async () => undefined)).toThrow(
      "must not return a Promise",
    );
  });
});
