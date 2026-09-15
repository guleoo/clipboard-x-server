import { ConfigInterpolationError } from "./error";
import { cloneConfig, isConfigObject } from "./merge";
import type {
  ConfigFieldNameMapper,
  ConfigObject,
  ConfigValue,
} from "./types";

const PLACEHOLDER = /\$\{([^}]+)\}/g;
const FULL_PLACEHOLDER = /^\$\{([^}]+)\}$/;

interface ResolveState {
  readonly root: ConfigObject;
  readonly env: NodeJS.ProcessEnv;
  readonly mapper: ConfigFieldNameMapper;
  readonly paths: string[];
}

function mapPath(path: string, mapper: ConfigFieldNameMapper): string {
  return path
    .split(".")
    .filter(Boolean)
    .map((part) => mapper.toTargetName(part))
    .join(".");
}

function pathValue(root: ConfigObject, path: string): ConfigValue {
  let current: unknown = root;
  for (const part of path.split(".").filter(Boolean)) {
    if (!isConfigObject(current) || !(part in current)) {
      throw new ConfigInterpolationError(
        `Referenced configuration path does not exist: ${path}`,
        { token: path },
      );
    }
    current = current[part];
  }
  return current as ConfigValue;
}

function tokenValue(token: string, state: ResolveState): ConfigValue {
  if (token.startsWith("env:")) {
    const name = token.slice(4).trim();
    if (!name) throw new ConfigInterpolationError("Environment placeholder has no name");
    const value = state.env[name];
    if (value === undefined) {
      throw new ConfigInterpolationError(`Environment variable is not defined: ${name}`, {
        token,
      });
    }
    return value;
  }

  const path = mapPath(token.trim(), state.mapper);
  if (!path) throw new ConfigInterpolationError("Configuration placeholder is empty");
  if (state.paths.includes(path)) {
    throw new ConfigInterpolationError(
      `Configuration interpolation cycle: ${[...state.paths, path].join(" -> ")}`,
      { token },
    );
  }

  state.paths.push(path);
  try {
    return resolveValue(pathValue(state.root, path), state);
  } finally {
    state.paths.pop();
  }
}

function embeddedValue(value: ConfigValue, token: string): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }
  throw new ConfigInterpolationError(
    `Placeholder ${token} cannot embed an object or array in a string`,
    { token },
  );
}

function resolveString(input: string, state: ResolveState): ConfigValue {
  const full = input.match(FULL_PLACEHOLDER);
  if (full) return cloneConfig(tokenValue(full[1]!, state));
  return input.replaceAll(PLACEHOLDER, (_match, token: string) =>
    embeddedValue(tokenValue(token, state), `\${${token}}`),
  );
}

function resolveValue(value: ConfigValue, state: ResolveState): ConfigValue {
  if (typeof value === "string") return resolveString(value, state);
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, state));
  if (isConfigObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveValue(item, state)]),
    );
  }
  return value;
}

export function interpolateConfig(
  config: ConfigObject,
  env: NodeJS.ProcessEnv,
  mapper: ConfigFieldNameMapper,
): ConfigObject {
  const root = cloneConfig(config);
  return resolveValue(root, { root, env, mapper, paths: [] }) as ConfigObject;
}
