import { ConfigError } from "./error";
import { isConfigObject } from "./merge";
import type {
  ConfigFieldNameMapper,
  ConfigObject,
  ConfigValue,
} from "./types";

class MapperRegistry {
  private readonly values = new Map<string, ConfigFieldNameMapper>();

  register(mapper: ConfigFieldNameMapper): void {
    const current = this.values.get(mapper.name);
    if (current && current !== mapper) {
      throw new ConfigError(`Config field mapper already exists: ${mapper.name}`);
    }
    this.values.set(mapper.name, mapper);
  }

  unregister(name: string): void {
    this.values.delete(name);
  }

  get(name: string): ConfigFieldNameMapper {
    const mapper = this.values.get(name);
    if (!mapper) throw new ConfigError(`Unknown config field mapper: ${name}`);
    return mapper;
  }
}

const registry = new MapperRegistry();
registry.register({
  name: "identity",
  toTargetName: (name) => name,
  toSourceName: (name) => name,
});
registry.register({
  name: "snake_case_to_camel_case",
  toTargetName: (name) =>
    name.replace(/_+([a-zA-Z0-9])/g, (_match, value: string) =>
      value.toUpperCase(),
    ),
  toSourceName: (name) =>
    name.replace(/[A-Z]/g, (value) => `_${value.toLowerCase()}`),
});
registry.register({
  name: "kebab_case_to_camel_case",
  toTargetName: (name) =>
    name.replace(/-+([a-zA-Z0-9])/g, (_match, value: string) =>
      value.toUpperCase(),
    ),
  toSourceName: (name) =>
    name.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`),
});

function mapValue(
  value: ConfigValue,
  mapper: ConfigFieldNameMapper,
  path: string,
): ConfigValue {
  if (Array.isArray(value)) return value.map((item) => mapValue(item, mapper, path));
  if (!isConfigObject(value)) return value;
  return applyFieldNameMapper(value, mapper, path);
}

export function applyFieldNameMapper(
  config: ConfigObject,
  mapper: ConfigFieldNameMapper,
  path: string,
): ConfigObject {
  const result: ConfigObject = {};
  for (const [sourceName, value] of Object.entries(config)) {
    const targetName = mapper.toTargetName(sourceName);
    if (targetName in result) {
      throw new ConfigError(
        `Duplicate config field after mapping: ${sourceName} -> ${targetName}`,
        { path },
      );
    }
    result[targetName] = mapValue(value, mapper, path);
  }
  return result;
}

export const fieldNameMappers = Object.freeze({
  get: (name: string) => registry.get(name),
  register: (mapper: ConfigFieldNameMapper) => registry.register(mapper),
  unregister: (name: string) => registry.unregister(name),
});
