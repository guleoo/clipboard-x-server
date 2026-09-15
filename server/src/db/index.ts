import { Lifecycle } from "../frame/core";
import { createDatabase } from "../frame/db";
import { dbSchema } from "./schema";

export type DbSchema = typeof dbSchema;

const database = createDatabase({ schema: dbSchema });

export const db = database.db;
export const Database = database.control;

Lifecycle.register({
  name: `database:${Database.inspect().name}`,
  on: "shutdown",
  phase: "dispose",
  order: 60,
  event: () => Database.close(),
});
