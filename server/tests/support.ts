import { join } from "node:path"
import {
  ConfigurationSchema,
  ConfigurationStore,
  loadConfig,
  type ServerConfig,
} from "../src/entry/config"

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
    storage: { dataDirectory: "./data" },
    administrator: { username: "administrator", password },
    devices: [],
    channels: [],
  }))
  return loadConfig(path)
}
