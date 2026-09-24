import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { configPath } from "../config/instance";
import { FrameConfig } from "../config";

export interface DatabaseConfig {
  readonly name: string;
  readonly url: string;
  readonly busyTimeoutMillis: number;
  readonly wal: boolean;
  readonly schemaPath: string;
  readonly migrationsFolder: string;
}

const sourceMigrations = resolve(import.meta.dir, "../../../drizzle");
const migrationsFolder = [
  resolve(dirname(process.execPath), "server/drizzle"),
  resolve(dirname(configPath), "drizzle"),
  sourceMigrations,
].find(existsSync) ?? sourceMigrations;

/** Runtime and database tools derive their paths from the shared data directory. */
export const databaseConfig: DatabaseConfig = Object.freeze({
  name: "clipboard-x",
  url: join(FrameConfig.DataDir, "clipboard-x.db"),
  busyTimeoutMillis: 5_000,
  wal: true,
  schemaPath: resolve(import.meta.dir, "../../db/schema.ts"),
  migrationsFolder,
});
