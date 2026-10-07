import { z } from "zod";
import { Config } from "../config";

export const SessionOptions = z
  .object({
    ttl: z.number().min(0.001).default(7 * 24 * 60 * 60),
    touchInterval: z.number().min(0.001).default(5 * 60),
    tokenLength: z.number().int().min(24).max(64).default(32),
  })
  .strict()
  .superRefine((value, context) => {
    if (Math.round(value.touchInterval * 1_000) >= Math.round(value.ttl * 1_000)) {
      context.addIssue({
        code: "custom",
        path: ["touchInterval"],
        message: "Session touch interval must be shorter than its TTL",
      });
    }
  })
  .default({
    ttl: 7 * 24 * 60 * 60,
    touchInterval: 5 * 60,
    tokenLength: 32,
  })
  .transform(({ ttl, touchInterval, tokenLength }) => ({
    ttlMillis: Math.round(ttl * 1_000),
    touchIntervalMillis: Math.round(touchInterval * 1_000),
    tokenBytes: tokenLength,
  }));

export const SessionConfig = Config.section("session", SessionOptions);
