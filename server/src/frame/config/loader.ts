import { existsSync, readFileSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, resolve } from "node:path";
import { parse } from "yaml";
import { ConfigError, ConfigImportCycleError } from "./error";
import { interpolateConfig } from "./interpolate";
import { applyFieldNameMapper, fieldNameMappers } from "./mapper";
import { deepMergeConfig, isConfigObject } from "./merge";
import type {
  ConfigObject,
  LoadContext,
  LoadYamlConfigOptions,
  RawConfigObject,
} from "./types";

const DEFAULT_MAPPER = "kebab_case_to_camel_case";
const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/u;

function importPath(specifier: string, fromFile: string): string {
  if (isAbsolute(specifier) || WINDOWS_ABSOLUTE_PATH.test(specifier)) return specifier;
  return resolve(fromFile, "..", specifier);
}

function rootObject(value: unknown, path: string): RawConfigObject {
  if (!isConfigObject(value)) {
    throw new ConfigError(`Configuration root must be an object: ${path}`, { path });
  }
  return value;
}

function importsOf(root: RawConfigObject, path: string): readonly string[] {
  const imports = root.import;
  if (imports === undefined) return [];
  if (!Array.isArray(imports) || imports.some((item) => typeof item !== "string")) {
    throw new ConfigError(`Configuration import must be a string array: ${path}`, {
      path,
    });
  }
  return imports as string[];
}

function contentOf(
  root: RawConfigObject,
  context: LoadContext,
  path: string,
): ConfigObject {
  const { import: _import, ...content } = root;
  return applyFieldNameMapper(content as ConfigObject, context.fieldNameMapper, path);
}

function parseYaml(text: string, path: string): RawConfigObject {
  try {
    return rootObject(parse(text), path);
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(`Cannot parse configuration: ${path}`, { path }, { cause: error });
  }
}

async function loadFile(path: string, context: LoadContext): Promise<ConfigObject> {
  if (context.stack.includes(path)) {
    throw new ConfigImportCycleError([...context.stack, path]);
  }
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (cause) {
    throw new ConfigError(`Cannot read configuration: ${path}`, { path }, { cause });
  }
  const root = parseYaml(text, path);
  const nested = { ...context, stack: [...context.stack, path] };
  let result = contentOf(root, context, path);
  for (const specifier of importsOf(root, path)) {
    result = deepMergeConfig(result, await loadFile(importPath(specifier, path), nested));
  }
  return result;
}

function loadFileSync(path: string, context: LoadContext): ConfigObject {
  if (context.stack.includes(path)) {
    throw new ConfigImportCycleError([...context.stack, path]);
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (cause) {
    throw new ConfigError(`Cannot read configuration: ${path}`, { path }, { cause });
  }
  const root = parseYaml(text, path);
  const nested = { ...context, stack: [...context.stack, path] };
  let result = contentOf(root, context, path);
  for (const specifier of importsOf(root, path)) {
    result = deepMergeConfig(result, loadFileSync(importPath(specifier, path), nested));
  }
  return result;
}

function modePath(path: string, mode: string): string {
  const extension = extname(path);
  return resolve(dirname(path), `${basename(path, extension)}-${mode}${extension}`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function loadContext(options: LoadYamlConfigOptions): LoadContext {
  return {
    env: options.env ?? process.env,
    stack: [],
    fieldNameMapper: fieldNameMappers.get(options.fieldNameMapper ?? DEFAULT_MAPPER),
  };
}

export function resolveConfigEntryPath(options: LoadYamlConfigOptions = {}): string {
  return options.filePath
    ? resolve(options.filePath)
    : resolve(options.cwd ?? process.cwd(), "config.yaml");
}

export async function loadYamlConfig(
  options: LoadYamlConfigOptions = {},
): Promise<ConfigObject> {
  const path = resolveConfigEntryPath(options);
  if (!(await fileExists(path))) {
    throw new ConfigError(`Configuration file does not exist: ${path}`, { path });
  }
  const context = loadContext(options);
  let result = options.context
    ? deepMergeConfig(
        applyFieldNameMapper(options.context, context.fieldNameMapper, "<context>"),
        await loadFile(path, context),
      )
    : await loadFile(path, context);
  if (options.mode && (options.mergeModeFile ?? true)) {
    const overridePath = modePath(path, options.mode);
    if (await fileExists(overridePath)) {
      result = deepMergeConfig(result, await loadFile(overridePath, context));
    }
  }
  return interpolateConfig(result, context.env, context.fieldNameMapper);
}

export function loadYamlConfigSync(
  options: LoadYamlConfigOptions = {},
): ConfigObject {
  const path = resolveConfigEntryPath(options);
  if (!existsSync(path)) {
    throw new ConfigError(`Configuration file does not exist: ${path}`, { path });
  }
  const context = loadContext(options);
  let result = options.context
    ? deepMergeConfig(
        applyFieldNameMapper(options.context, context.fieldNameMapper, "<context>"),
        loadFileSync(path, context),
      )
    : loadFileSync(path, context);
  if (options.mode && (options.mergeModeFile ?? true)) {
    const overridePath = modePath(path, options.mode);
    if (existsSync(overridePath)) {
      result = deepMergeConfig(result, loadFileSync(overridePath, context));
    }
  }
  return interpolateConfig(result, context.env, context.fieldNameMapper);
}
