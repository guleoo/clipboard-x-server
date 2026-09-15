import { describe, expect, it } from "bun:test";
import type { SQL } from "drizzle-orm";
import { getTableConfig, SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { DateFormat, PlainDate, PlainTime, ZonedDateTime } from "../src/frame/core";
import {
  bigint,
  boolean,
  date,
  id,
  id_like,
  int,
  json,
  number_list,
  str_list,
  table,
  time,
  timestamp,
  timestamp0,
  varchar,
} from "../src/frame/db/dbtype";
import { createDatabase } from "../src/frame/db";
import "../src/config";

const dbtypeProbe = table("dbtype_probe", {
  id: id(),
  parentId: id_like("parent_id"),
  name: varchar("name", { length: 64 }).notNull(),
  quantity: int("quantity").notNull(),
  enabled: boolean("enabled").notNull(),
  amount: bigint("amount").notNull(),
  labels: str_list("labels").notNull(),
  scores: number_list("scores").notNull(),
  metadata: json<{ readonly source: string }>("metadata").notNull(),
  eventDate: date("event_date").notNull(),
  eventTime: time("event_time").notNull(),
  happenedAt: timestamp0("happened_at").notNull(),
  preEpochAt: timestamp0("pre_epoch_at").notNull(),
  createdAt: timestamp0("created_at").defaultNow().notNull(),
});

const timestampPrecisionProbe = table("timestamp_precision_probe", {
  p0: timestamp0("p0").defaultNow(),
  p1: timestamp("p1", { precision: 1 }).defaultNow(),
  p2: timestamp("p2", { precision: 2 }).defaultNow(),
  p3: timestamp("p3", { precision: 3 }).defaultNow(),
});

describe("SQLite dbtype", () => {
  it("uses SQLite INTEGER for governed number and bigint columns", () => {
    const columns = Object.fromEntries(
      getTableConfig(dbtypeProbe).columns.map((column) => [
        column.name,
        column.getSQLType(),
      ]),
    );

    expect(columns.quantity).toBe("integer");
    expect(columns.amount).toBe("integer");
  });

  it("applies timestamp precision to database defaults", () => {
    const dialect = new SQLiteSyncDialect();
    const defaults = Object.fromEntries(
      getTableConfig(timestampPrecisionProbe).columns.map((column) => [
        column.name,
        dialect.sqlToQuery(column.default as SQL).sql,
      ]),
    );

    expect(defaults.p0).toContain("/ 1000) * 1000");
    expect(defaults.p1).toContain("/ 100) * 100");
    expect(defaults.p2).toContain("/ 10) * 10");
    expect(defaults.p3).not.toContain(" / ");
  });

  it("preserves governed values through Drizzle", () => {
    const database = createDatabase({ schema: { dbtypeProbe } });
    database.control.init();
    database.db.run(`
      create table dbtype_probe (
        id text primary key not null,
        parent_id text,
        name text not null,
        quantity integer not null,
        enabled integer not null,
        amount integer not null,
        labels text not null,
        scores text not null,
        metadata text not null,
        event_date text not null,
        event_time text not null,
        happened_at integer not null,
        pre_epoch_at integer not null,
        created_at integer not null default (cast(strftime('%s', 'now') as integer) * 1000)
      )
    `);

    const moment = ZonedDateTime.from("2026-09-15T12:34:56.789+08:00[Asia/Shanghai]");
    database.db
      .insert(dbtypeProbe)
      .values({
        name: "probe",
        quantity: 42,
        enabled: true,
        amount: 9_007_199_254_740_993n,
        labels: ["alpha,beta", "gamma"],
        scores: [1, 2.5],
        metadata: { source: "test" },
        eventDate: PlainDate.from("2026-09-15"),
        eventTime: PlainTime.from("12:34:56"),
        happenedAt: moment,
        preEpochAt: ZonedDateTime.from(
          "1969-12-31T23:59:59.999999999+00:00[UTC]",
        ),
      })
      .run();

    const row = database.db.select().from(dbtypeProbe).get();
    expect(row?.id).toHaveLength(24);
    expect(row?.parentId).toBeNull();
    expect(row?.quantity).toBe(42);
    expect(row?.enabled).toBe(true);
    expect(row?.amount).toBe(9_007_199_254_740_993n);
    expect(
      database.db.get(
        "select amount, typeof(amount) from dbtype_probe",
      ) as unknown,
    ).toEqual([9_007_199_254_740_993n, "integer"]);
    expect(row?.labels).toEqual(["alpha,beta", "gamma"]);
    expect(row?.scores).toEqual([1, 2.5]);
    expect(row?.metadata).toEqual({ source: "test" });
    expect(row?.eventDate.equals(PlainDate.from("2026-09-15"))).toBe(true);
    expect(row?.eventTime.equals(PlainTime.from("12:34:56"))).toBe(true);
    expect(DateFormat.utc(row!.happenedAt)).toBe("2026-09-15T04:34:56+00:00");
    expect(DateFormat.utc(row!.preEpochAt)).toBe("1969-12-31T23:59:59+00:00");
    expect(row?.createdAt).toBeInstanceOf(ZonedDateTime);

    database.control.close();
  });

  it("rejects unsafe values passed through governed integer columns", () => {
    const integerProbe = table("integer_probe", {
      value: int("value").notNull(),
    });
    const database = createDatabase({ schema: { integerProbe } });
    database.control.init();
    database.db.run("create table integer_probe (value integer not null)");

    expect(() =>
      database.db
        .insert(integerProbe)
        .values({ value: Number.MAX_SAFE_INTEGER + 1 })
        .run(),
    ).toThrow("outside JavaScript's safe range");

    database.control.close();
  });
});
