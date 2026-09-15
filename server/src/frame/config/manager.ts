import type { z } from "zod";
import { dirname, isAbsolute, resolve } from "node:path";
import { loadYamlConfigSync, resolveConfigEntryPath } from "./loader";
import { cloneConfig } from "./merge";
import type { ConfigObject, LoadYamlConfigOptions } from "./types";

type Primitive = string | number | boolean | bigint | symbol | null | undefined;
type Callable = (...args: never[]) => unknown;
export type ReadonlyDeep<Value> = Value extends Primitive | Callable
  ? Value
  : Value extends readonly (infer Item)[]
    ? ReadonlyArray<ReadonlyDeep<Item>>
    : { readonly [Key in keyof Value]: ReadonlyDeep<Value[Key]> };

function deepFreeze<Value>(value: Value, seen = new WeakSet<object>()): Value {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const item of Object.values(value)) deepFreeze(item, seen);
  return Object.freeze(value);
}

export class ConfigManager {
  private raw?: ConfigObject;
  private readonlyRaw?: ReadonlyDeep<ConfigObject>;
  private readonly options: LoadYamlConfigOptions;
  private readonly parsed = new WeakMap<z.ZodType, unknown>();
  private readonly picked = new Map<string, WeakMap<z.ZodType, unknown>>();
  readonly filePath: string;

  constructor(options: LoadYamlConfigOptions = {}) {
    this.options = options;
    this.filePath = resolveConfigEntryPath(options);
  }

  resolvePath(path: string): string {
    return isAbsolute(path) ? path : resolve(dirname(this.filePath), path);
  }

  get(): ReadonlyDeep<ConfigObject> {
    this.readonlyRaw ??= deepFreeze(cloneConfig(this.load()));
    return this.readonlyRaw;
  }

  parse<Schema extends z.ZodType>(schema: Schema): ReadonlyDeep<z.output<Schema>> {
    if (this.parsed.has(schema)) {
      return this.parsed.get(schema) as ReadonlyDeep<z.output<Schema>>;
    }
    const value = deepFreeze(schema.parse(this.load()));
    this.parsed.set(schema, value);
    return value as ReadonlyDeep<z.output<Schema>>;
  }

  pick<Schema extends z.ZodType>(
    path: string,
    schema: Schema,
  ): ReadonlyDeep<z.output<Schema>> {
    let cache = this.picked.get(path);
    if (!cache) {
      cache = new WeakMap();
      this.picked.set(path, cache);
    }
    if (cache.has(schema)) return cache.get(schema) as ReadonlyDeep<z.output<Schema>>;
    const value = deepFreeze(schema.parse(this.resolveValue(path)));
    cache.set(schema, value);
    return value as ReadonlyDeep<z.output<Schema>>;
  }

  section<Schema extends z.ZodType>(
    name: string,
    schema: Schema,
  ): ReadonlyDeep<z.output<Schema>> {
    return this.pick(name, schema);
  }

  private load(): ConfigObject {
    this.raw ??= loadYamlConfigSync(this.options);
    return this.raw;
  }

  private resolveValue(path: string): unknown {
    let value: unknown = this.load();
    for (const part of path.split(".").filter(Boolean)) {
      if (typeof value !== "object" || value === null || !(part in value)) {
        return undefined;
      }
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  }
}
