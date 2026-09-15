export type SafeSqliteValue<Value> = Value extends bigint
  ? number
  : Value extends readonly (infer Item)[]
    ? SafeSqliteValue<Item>[]
    : Value extends object
      ? { [Key in keyof Value]: SafeSqliteValue<Value[Key]> }
      : Value;

export function sqliteValue<Value>(value: Value): SafeSqliteValue<Value> {
  if (typeof value === "bigint") {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) {
      throw new RangeError(`SQLite integer is outside JavaScript's safe range: ${value}`);
    }
    return number as SafeSqliteValue<Value>;
  }
  if (Array.isArray(value)) return value.map(sqliteValue) as SafeSqliteValue<Value>;
  if (value === null || typeof value !== "object") {
    return value as SafeSqliteValue<Value>;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sqliteValue(item)]),
  ) as SafeSqliteValue<Value>;
}
