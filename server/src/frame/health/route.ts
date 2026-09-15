import { Result } from "../core";
import type { DatabaseControl } from "../db";
import { createPublicHono } from "../hono/router";
import { Health } from "./checker";

export function registerDefaultHealthChecks(
  database: Pick<DatabaseControl, "check">,
): void {
  Health.register({ name: "database", check: () => database.check() });
}

export const healthRoutes = createPublicHono("/health");

healthRoutes.get("/live", (context) => context.json(Result.ok()));

healthRoutes.get("/ready", async (context) => {
  const result = await Health.checkReady();
  if (result.ok) return context.json(Result.ok());
  return context.json(
    {
      code: 503,
      msg: "Service unavailable",
      result: { failed: result.failed },
    },
    503,
  );
});
