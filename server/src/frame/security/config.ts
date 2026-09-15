import { z } from "zod";
import { Config } from "../config";

export const SecurityOptions = z
  .object({
    jwtSecret: z.string().min(32).optional(),
    jwtAlgorithm: z.literal("HS256").default("HS256"),
    tokenPrefix: z.string().trim().min(1).default("Bearer"),
    accessTokenTtlMillis: z.number().int().positive().default(15 * 60 * 1_000),
    password: z
      .object({
        memoryCost: z.number().int().min(19_456).default(65_536),
        timeCost: z.number().int().min(2).default(3),
      })
      .strict()
      .default({ memoryCost: 65_536, timeCost: 3 }),
  })
  .strict();

export const SecurityConfig = Config.section("security", SecurityOptions);
