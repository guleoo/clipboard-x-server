import type { Fields } from "../core";
import { DbError } from "./error";

type UnionToIntersection<Value> = (
  Value extends unknown ? (value: Value) => void : never
) extends (value: infer Result) => void
  ? Result
  : never;

export type MergedSchema<Schemas extends readonly Fields[]> =
  UnionToIntersection<Schemas[number]>;

export function mergeSchema<const Schemas extends readonly Fields[]>(
  ...schemas: Schemas
): MergedSchema<Schemas> {
  const merged = {} as Fields;
  const names = new Set<string>();

  for (const schema of schemas) {
    for (const key of Object.keys(schema)) {
      if (names.has(key)) {
        throw new DbError(`Duplicate database schema export "${key}"`);
      }
      names.add(key);
      Object.defineProperty(merged, key, {
        configurable: true,
        enumerable: true,
        value: schema[key],
        writable: true,
      });
    }
  }

  return merged as MergedSchema<Schemas>;
}
