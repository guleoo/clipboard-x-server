import { initZone } from "../core";
import { z } from "zod";
import { Config, configMode } from "./instance";
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
  export const App = Config.section("app", AppOptions);
  export const DataDir = Config.resolvePath(Config.section("dataDir", z.string().trim().min(1).default("./data")));
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
