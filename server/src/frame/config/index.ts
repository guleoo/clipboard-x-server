import { initZone, validZone } from "../core";
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
  const appOverrides = Config.section("app", AppOptions.optional());
  export const App = Object.freeze(AppOptions.parse({
    ...appOverrides,
    hostname: Config.section("host", z.string().trim().min(1).optional()) ?? appOverrides?.hostname,
    port: Config.section("port", z.coerce.number().int().nonnegative().optional()) ?? appOverrides?.port,
    timezone: Config.section("timezone", z.string().refine(validZone, "Invalid time zone").optional()) ?? appOverrides?.timezone,
  }));
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
