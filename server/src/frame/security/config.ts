import { z } from "zod";
import { Config } from "../config";

export const SecurityOptions = z
  .object({
    jwtSecret: z.string().min(32).optional(),
    jwtAlgorithm: z.literal("HS256").default("HS256"),
    tokenPrefix: z.string().trim().min(1).default("Bearer"),
    accessTokenTtl: z.number().min(0.001).default(15 * 60),
    password: z
      .object({
        memoryCost: z.number().int().min(19_456).default(65_536),
        timeCost: z.number().int().min(2).default(3),
      })
      .strict()
      .default({ memoryCost: 65_536, timeCost: 3 }),
  })
  .strict()
  .prefault({})
  .transform(({ accessTokenTtl, ...security }) => ({
    ...security,
    accessTokenTtlMillis: Math.round(accessTokenTtl * 1_000),
  }));

export const SecurityConfig = Config.section("security", SecurityOptions);
