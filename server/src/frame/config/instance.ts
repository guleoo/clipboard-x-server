import { ConfigManager } from "./manager";
import { resolveConfigRoot } from "./resolver";
import { join, resolve } from "node:path";
import type { LoadYamlConfigOptions } from "./types";

export function resolveConfigMode(env: NodeJS.ProcessEnv = process.env): string {
  const mode = env.APP_ENV ?? env.NODE_ENV ?? "dev";
  return mode === "production" ? "prod" : mode;
}

function commandLineConfigPath(arguments_: readonly string[]): string | undefined {
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument.startsWith("--config=")) return resolve(argument.slice("--config=".length));
    if (argument === "--config") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--config requires a YAML file path");
      return resolve(value);
    }
  }
  return undefined;
}

export function resolveConfigPath(
  arguments_: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): string {
  const selected = commandLineConfigPath(arguments_) ?? env.APP_CONFIG_FILE;
  if (selected) return resolve(selected);
  return join(env.APP_CONFIG_DIR ?? resolveConfigRoot() ?? process.cwd(), "config.yaml");
}

export const configMode = resolveConfigMode();
export const configPath = resolveConfigPath();
export const configLoadOptions = Object.freeze({
  filePath: configPath,
  mode: configMode,
  mergeModeFile: false,
  mergeImportFiles: false,
} satisfies LoadYamlConfigOptions);

/** All Frame modules share this process-wide immutable configuration source. */
export const Config = new ConfigManager(configLoadOptions);
