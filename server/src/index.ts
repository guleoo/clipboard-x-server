export { createServerApp, startServer } from "./entry";
export { routes } from "./route";

import { startServer } from "./entry";
import { config, publicConfig } from "./config";
import { Database } from "./db";
import { Lifecycle } from "./frame/core";
import { databaseConfig } from "./frame/db";
import { Log } from "./frame/logger";
import { routes } from "./route";

const logger = Log.create({ service: "server" });

async function healthcheck(): Promise<void> {
  const hostname = config.host === "0.0.0.0" || config.host === "::"
    ? "127.0.0.1"
    : config.host;
  const response = await fetch(
    `http://${hostname}:${config.port}/health/ready`,
  ).catch(() => undefined);
  process.exitCode = response?.ok ? 0 : 1;
  await Lifecycle.shutdown({ reason: "manual" });
}

async function main(arguments_: readonly string[]): Promise<void> {
  if (arguments_.includes("--healthcheck")) {
    await healthcheck();
    return;
  }
  if (arguments_.includes("--migrate")) {
    Database.migrate({ migrationsFolder: databaseConfig.migrationsFolder });
    logger.info("Database migrations complete", { event: "database.migrated" });
    if (!arguments_.includes("--serve")) {
      await Lifecycle.shutdown({ reason: "manual" });
      return;
    }
  }
  const listener = await startServer(routes);
  logger.info("Server listening", {
    event: "server.started",
    url: listener.url.toString(),
    config: publicConfig(),
  });
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    logger.error("Server startup failed", { error });
    await Lifecycle.shutdown({ reason: "manual" }).catch(() => undefined);
    process.exitCode = 1;
  }
}
