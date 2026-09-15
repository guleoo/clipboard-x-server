import { createMiddleware } from "hono/factory";
import { routePath } from "hono/route";
import { RequestStore } from "./request-context";
import { Log } from "../logger";

export interface RequestLoggerOptions {
  /** Override the writer for an explicitly composed app or diagnostic harness. */
  readonly logger?: Pick<Log.Logger, "info">;
}

export function requestLogger(options: RequestLoggerOptions = {}) {
  const logger = options.logger ?? Log.create({ service: "http" });

  return createMiddleware(async (context, next) => {
    const startedAt = performance.now();
    await next();
    const matched = routePath(context);

    logger.info("HTTP request completed", {
      method: context.req.method,
      route:
        matched === "" || matched === "*" || matched === "/*"
          ? "<unmatched>"
          : matched,
      status: context.res.status,
      durationMillis: Math.max(0, Math.round(performance.now() - startedAt)),
      requestId: RequestStore.get("requestId"),
      tenantId: RequestStore.get("tenantId"),
      uid: RequestStore.get("uid"),
      authType: RequestStore.get("authType"),
    });
  });
}
