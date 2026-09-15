import type { Logger } from "drizzle-orm/logger";
import { Log } from "../logger";

const log = Log.create({ service: "database" });

class DrizzleLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    log.debug("SQL", { query, parameterCount: params.length });
  }
}

export const drizzleLogger = new DrizzleLogger();
