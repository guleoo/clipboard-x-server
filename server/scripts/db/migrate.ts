import { loadConfig } from "../../src/config"
import { migrateApplicationDatabase } from "../../src/db"
import { Log } from "../../src/frame/logger";
import { initZone } from "../../src/frame/core/date"

const config = loadConfig()
initZone(config.timezone)
Log.init(config.logger);
const logger = Log.create({ service: "database:migrate" });

async function main(): Promise<void> {
  try {
    logger.info("Running database migrations");
    migrateApplicationDatabase(config)
    logger.info("Database migrations complete");
  } catch (error) {
    logger.error("Database migration failed", { error });
    process.exitCode = 1;
  } finally {
    await Log.flush()
  }
}

void main();
