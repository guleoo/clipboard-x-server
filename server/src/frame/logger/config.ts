import { z } from "zod";
import type { LogOptions } from "./type";

const level = z.enum(["debug", "info", "warn", "error"]);
const tagValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const maxFiles = z.union([
  z
    .string()
    .trim()
    .regex(/^\d+d$/i, "maxFiles must use a day suffix such as 30d"),
  z.number().int().positive(),
]);
const maxSize = z.union([
  z
    .string()
    .trim()
    .regex(
      /^(?:0\.\d+|[1-9]\d*)[kmg]$/i,
      "maxSize must use k, m or g such as 100m",
    ),
  z.number().int().positive(),
]);

const consoleDefaults = {
  enabled: true,
  level: "info" as const,
};

const fileDefaults = {
  enabled: true,
  level: "info" as const,
  dir: "logs",
  filename: "app-%DATE%.log",
  maxFiles: "30d",
  maxSize: "100m",
  zippedArchive: true,
};

export const LoggerOptions = z
  .object({
    defaultMeta: z.record(z.string(), tagValue).default({}),
    console: z
      .object({
        enabled: z.boolean().default(consoleDefaults.enabled),
        level: level.default(consoleDefaults.level),
      })
      .strict()
      .default(consoleDefaults),
    file: z
      .object({
        enabled: z.boolean().default(fileDefaults.enabled),
        level: level.default(fileDefaults.level),
        dir: z.string().trim().min(1).default(fileDefaults.dir),
        filename: z.string().trim().min(1).default(fileDefaults.filename),
        maxFiles: maxFiles.default(fileDefaults.maxFiles),
        maxSize: maxSize.default(fileDefaults.maxSize),
        zippedArchive: z.boolean().default(fileDefaults.zippedArchive),
      })
      .strict()
      .default(fileDefaults),
  })
  .strict()
  .default({
    defaultMeta: {},
    console: consoleDefaults,
    file: fileDefaults,
  })
  .describe("Logger configuration");

export type ResolvedLoggerOptions = z.output<typeof LoggerOptions>;

export function resolveLoggerOptions(
  options: LogOptions = {},
): ResolvedLoggerOptions {
  return LoggerOptions.parse(options);
}
