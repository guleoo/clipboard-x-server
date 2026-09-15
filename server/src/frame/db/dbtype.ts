import {
  DateFormat,
  DateParser,
  createId,
  type PlainDate,
  type PlainTime,
  type ZonedDateTime,
  withZone,
} from "../core";
import { sql } from "drizzle-orm";
import {
  blob,
  check,
  customType,
  foreignKey,
  index,
  integer as sqliteInteger,
  numeric,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export {
  blob,
  check,
  foreignKey,
  index,
  numeric,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
};

export const table = sqliteTable;
export const varchar = text;
export const decimal = numeric;

export const snippet = Object.freeze({
  now: () =>
    sql`cast((julianday('now') - 2440587.5) * 86400000 as integer)`,
  bool: (value: boolean) => (value ? sql`1` : sql`0`),
  null: () => sql`null`,
});

export const id_like = (name: string) => text(name, { length: 24 });

export const id = () =>
  id_like("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => createId());

const bigintType = customType<{
  data: bigint;
  driverData: bigint;
}>({
  dataType() {
    return "integer";
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return value;
  },
});

export const bigint = (name: string) => bigintType(name);

function safeIntegerNumber(value: number | bigint): number {
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue)) {
    throw new RangeError(`Integer is outside JavaScript's safe range: ${value}`);
  }
  return numberValue;
}

const intType = customType<{
  data: number;
  driverData: number | bigint;
}>({
  dataType() {
    return "integer";
  },
  toDriver(value) {
    return safeIntegerNumber(value);
  },
  fromDriver(value) {
    return safeIntegerNumber(value);
  },
});

export const int = (name: string) => intType(name);
export const integer = int;
export const smallint = int;
export const serial = (name: string) =>
  sqliteInteger(name).primaryKey({ autoIncrement: true });

export const boolean = (name: string) =>
  sqliteInteger(name, { mode: "boolean" });
export const bit = boolean;

export const json = <Value = unknown>(name: string) =>
  text(name, { mode: "json" }).$type<Value>();
export const jsonb = json;

const dateType = customType<{ data: PlainDate; driverData: string }>({
  dataType() {
    return "text";
  },
  toDriver(value) {
    return DateFormat.pdate(value);
  },
  fromDriver(value) {
    return DateParser.pdate(value);
  },
});

export const date = (name: string) => dateType(name);

const timeType = customType<{ data: PlainTime; driverData: string }>({
  dataType() {
    return "text";
  },
  toDriver(value) {
    return DateFormat.ptime(value);
  },
  fromDriver(value) {
    return DateParser.ptime(value);
  },
});

export const time = (name: string) => timeType(name);

export interface TimestampConfig {
  readonly precision?: 0 | 1 | 2 | 3;
}

type DefaultableColumn = {
  default(value: unknown): unknown;
};

type WithDefaultNow<Column extends DefaultableColumn> = Column & {
  defaultNow(): ReturnType<Column["default"]>;
};

function timestampNow(precision?: TimestampConfig["precision"]) {
  const current = snippet.now();
  if (precision === undefined || precision === 3) return current;
  const unit = sql.raw(String(10 ** (3 - precision)));
  return sql`((${current} / ${unit}) * ${unit})`;
}

function withDefaultNow<Column extends DefaultableColumn>(
  column: Column,
  precision?: TimestampConfig["precision"],
): WithDefaultNow<Column> {
  return Object.assign(column, {
    defaultNow() {
      return column.default(timestampNow(precision));
    },
  }) as WithDefaultNow<Column>;
}

function timestampMilliseconds(
  value: ZonedDateTime,
  precision?: TimestampConfig["precision"],
): number {
  const milliseconds = value.epochMilliseconds;
  if (precision === undefined || precision === 3) return milliseconds;
  const unit = 10 ** (3 - precision);
  return Math.floor(milliseconds / unit) * unit;
}

function timestampType(config?: TimestampConfig) {
  return customType<{
    data: ZonedDateTime;
    driverData: number | bigint;
  }>({
    dataType() {
      return "integer";
    },
    toDriver(value) {
      return timestampMilliseconds(value, config?.precision);
    },
    fromDriver(value) {
      return withZone(DateParser.timestamp(safeIntegerNumber(value)));
    },
  });
}

export const timestamp = (name: string, config?: TimestampConfig) =>
  withDefaultNow(timestampType(config)(name), config?.precision);
export const timestamp0 = (name: string) => timestamp(name, { precision: 0 });
export const timestamp3 = (name: string) => timestamp(name, { precision: 3 });

// SQLite stores both variants as epoch milliseconds; the names preserve intent.
export const timestamptz = timestamp;
export const timestamptz0 = timestamp0;
export const timestamptz3 = timestamp3;

export const str_list = (name: string) => json<readonly string[]>(name);
export const number_list = (name: string) => json<readonly number[]>(name);
