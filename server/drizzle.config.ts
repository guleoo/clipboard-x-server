import { defineConfig } from "drizzle-kit";
import { relative } from "node:path";
import { databaseConfig } from "./src/frame/db/config";

const localPath = (path: string) => `./${relative(process.cwd(), path)}`;

export default defineConfig({
  dialect: "sqlite",
  schema: localPath(databaseConfig.schemaPath),
  out: localPath(databaseConfig.migrationsFolder),
  dbCredentials: {
    url: databaseConfig.url,
  },
});
