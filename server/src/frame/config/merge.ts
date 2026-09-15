import type { ConfigObject, ConfigValue } from "./types";

export function isConfigObject(value: unknown): value is ConfigObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cloneConfig<Value extends ConfigValue>(value: Value): Value {
  if (Array.isArray(value)) {
    return value.map((item) => cloneConfig(item)) as Value;
  }
  if (isConfigObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneConfig(item)]),
    ) as Value;
  }
  return value;
}

export function deepMergeConfig<Base extends ConfigObject>(
  base: Base,
  override: ConfigObject,
): Base {
  const result: ConfigObject = cloneConfig(base);
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] =
      isConfigObject(current) && isConfigObject(value)
        ? deepMergeConfig(current, value)
        : cloneConfig(value);
  }
  return result as Base;
}
