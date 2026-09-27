import { initZone } from "../core";
import { Config, configMode } from "./instance";
import { ConfigError } from "./error";
import { AppOptions, LoggerConfigOptions } from "./schema";

export * from "./error";
export { Config, configLoadOptions, configMode, configPath, resolveConfigMode, resolveConfigPath } from "./instance";
export * from "./loader";
export * from "./manager";
export * from "./mapper";
export * from "./merge";
export * from "./resolver";
export * from "./schema";
export type * from "./types";

export namespace FrameConfig {
  export const Environment = configMode;
  for (const [key, sourceName] of [
    ["host", "host"],
    ["port", "port"],
    ["timezone", "timezone"],
    ["dataDir", "data-dir"],
  ] as const) {
    if (Object.hasOwn(Config.get(), key)) {
      throw new ConfigError(`Top-level ${sourceName} is not supported; use app.${sourceName}`, { path: Config.filePath });
    }
  }
  export const App = Config.section("app", AppOptions);
  export const DataDir = Config.resolvePath(App.dataDir);
  const logger = Config.section("logger", LoggerConfigOptions);
  export const Logger = Object.freeze({
    ...logger,
    file: Object.freeze({
      ...logger.file,
      dir: Config.resolvePath(logger.file.dir),
    }),
  });
}

initZone(FrameConfig.App.timezone);
