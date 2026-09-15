import { Database } from "../../src/db";
import { Lifecycle } from "../../src/frame/core";
import { databaseConfig } from "../../src/frame/db";
import { Log } from "../../src/frame/logger";

const logger = Log.create({ service: "database:migrate" });

async function main(): Promise<void> {
  try {
    Database.init();
    logger.info("Running database migrations");
    Database.migrate({
      migrationsFolder: databaseConfig.migrationsFolder,
    });
    logger.info("Database migrations complete");
  } catch (error) {
    logger.error("Database migration failed", { error });
    process.exitCode = 1;
  } finally {
    try {
      await Lifecycle.shutdown({ reason: "manual" });
    } catch (error) {
      console.error("Database migration shutdown failed", error);
      process.exitCode = 1;
    }
  }
}

void main();
