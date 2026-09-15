import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { DomainError } from "../common/error";
import { RequestStore } from "../frame/hono";
import { HttpError } from "../frame/hono/error";
import { Log } from "../frame/logger";

const logger = Log.create({ service: "http" });

export const productErrorHandler: ErrorHandler = (error, context) => {
  const requestId = RequestStore.get("requestId") ?? "unknown";
  if (error instanceof DomainError) {
    return context.json({ error: {
      code: error.errorCode,
      message: error.message,
      requestId,
      details: error.details ?? {},
    } }, error.status as ContentfulStatusCode);
  }
  if (error instanceof HttpError) {
    const code = error.status === 429
      ? "rate_limited"
      : error.status === 401
        ? context.req.path.startsWith("/admin/api/") ? "not_authenticated" : "invalid_key"
        : "invalid_request";
    return context.json({ error: {
      code,
      message: error.message,
      requestId,
      details: error.data ?? {},
    } }, error.status);
  }
  if (error instanceof HTTPException) {
    return context.json({ error: {
      code: "invalid_request",
      message: error.message,
      requestId,
      details: {},
    } }, error.status);
  }
  logger.error("Unhandled HTTP request error", {
    error,
    method: context.req.method,
    route: context.req.routePath,
    requestId,
  });
  return context.json({ error: {
    code: "internal_error",
    message: "The server could not complete the request",
    requestId,
    details: {},
  } }, 500);
};
