import { join, resolve } from "node:path"
import {
  ConfigurationSchema,
  ConfigurationStore,
  loadConfig,
  type ServerConfig,
} from "../src/config"
import { migrateApplicationDatabase } from "../src/db"

export function createTestConfig(directory: string, password = "1234567"): ServerConfig {
  const path = join(directory, "config.yaml")
  ConfigurationStore.create(path, ConfigurationSchema.parse({
    version: 1,
    server: {
      environment: "test",
      host: "127.0.0.1",
      port: 8787,
      webRoot: "./web",
      cookieSecure: false,
    },
    storage: {
      dataDirectory: "./data",
      migrationsDirectory: resolve(import.meta.dir, "../drizzle"),
    },
    administrator: { username: "administrator", password },
    devices: [],
    channels: [],
  }))
  const config = loadConfig(path)
  migrateApplicationDatabase(config)
  return config
}
