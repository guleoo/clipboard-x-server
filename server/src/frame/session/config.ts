import { z } from "zod";
import { Config } from "../config";

export const SessionOptions = z
  .object({
    ttlMillis: z.number().int().positive().default(7 * 24 * 60 * 60 * 1_000),
    touchIntervalMillis: z.number().int().positive().default(5 * 60 * 1_000),
    tokenBytes: z.number().int().min(24).max(64).default(32),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.touchIntervalMillis >= value.ttlMillis) {
      context.addIssue({
        code: "custom",
        path: ["touchIntervalMillis"],
        message: "Session touch interval must be shorter than its TTL",
      });
    }
  })
  .default({
    ttlMillis: 7 * 24 * 60 * 60 * 1_000,
    touchIntervalMillis: 5 * 60 * 1_000,
    tokenBytes: 32,
  });

export const SessionConfig = Config.section("session", SessionOptions);
