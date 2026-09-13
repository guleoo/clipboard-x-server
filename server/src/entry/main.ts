import { Application } from "../application"
import { Lifecycle } from "../frame/core"
import { Server } from "../frame/hono/server"
import { Log } from "../frame/logger"
import { createHttpApp } from "../http/app"
import { configurationPath, loadConfig, publicConfig } from "../config"
import { migrateApplicationDatabase } from "../db"
import { initZone } from "../frame/core/date"

export async function main(arguments_: readonly string[] = process.argv.slice(2)): Promise<void> {
  const config = loadConfig(configurationPath(arguments_))
  if (arguments_.includes("--healthcheck")) {
    const host = config.host === "0.0.0.0" || config.host === "::" ? "127.0.0.1" : config.host
    const response = await fetch(`http://${host}:${config.port}/health/ready`).catch(() => undefined)
    process.exitCode = response?.ok ? 0 : 1
    return
  }

  initZone(config.timezone)
  Log.init(config.logger)
  const logger = Log.create({ service: "entry" })
  try {
    if (arguments_.includes("--migrate")) {
      migrateApplicationDatabase(config)
      logger.info("Database migrations complete", { event: "database.migrated" })
      if (!arguments_.includes("--serve")) {
        await Lifecycle.shutdown({ reason: "manual" })
        return
      }
    }
    const application = await Application.create(config)
    const app = createHttpApp(application)
    const listener = await Server.listen(app, {
      hostname: config.host,
      port: config.port,
      shutdownTimeoutMillis: config.shutdownTimeoutMs,
    })
    logger.info("Server started", {
      event: "server.started",
      url: listener.url.toString(),
      config: publicConfig(config),
    })
  } catch (error) {
    logger.error(error, { event: "server.start_failed" })
    await Lifecycle.shutdown({ reason: "manual" }).catch(() => undefined)
    throw error
  }
}
