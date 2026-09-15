import { z } from "zod";
import { Config } from "../config/instance";

export const DatabaseOptions = z
  .object({
    name: z.string().trim().min(1).default("app-db"),
    url: z.string().trim().min(1).default("data/app.db"),
    busyTimeoutMillis: z.number().int().positive().default(5_000),
    wal: z.boolean().default(true),
    schemaPath: z.string().default("./src/db/schema.ts"),
    migrationsFolder: z.string().default("./drizzle"),
  })
  .strict();

export type DatabaseConfig = Readonly<z.infer<typeof DatabaseOptions>>;

/** Runtime and database tools share this single immutable configuration source. */
const value = Config.section("database", DatabaseOptions);

export const databaseConfig: DatabaseConfig = Object.freeze({
  ...value,
  url: value.url === ":memory:" ? value.url : Config.resolvePath(value.url),
  schemaPath: Config.resolvePath(value.schemaPath),
  migrationsFolder: Config.resolvePath(value.migrationsFolder),
});
