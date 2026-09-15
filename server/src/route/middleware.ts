import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { DomainError } from "../common/error";
import { config } from "../config";
import { rateLimit } from "../frame/security";

export const securityHeaders: MiddlewareHandler = async (context, next) => {
  await next();
  context.header("X-Content-Type-Options", "nosniff");
  context.header("X-Frame-Options", "DENY");
  context.header("Referrer-Policy", "no-referrer");
  context.header(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
};

const enforceJsonBodyLimit = bodyLimit({
  maxSize: config.jsonBodyLimitBytes,
  onError() {
    throw new DomainError("too_large", "JSON request body is too large", 413);
  },
});

export const jsonBodyLimit: MiddlewareHandler = async (context, next) => {
  const contentType = context.req.header("content-type") ?? "";
  if (
    !["GET", "HEAD"].includes(context.req.method) &&
    contentType.includes("application/json")
  ) {
    return enforceJsonBodyLimit(context, next);
  }
  return next();
};

export const requestRateLimit = rateLimit({
  name: "http",
  limit: config.rateLimit.limit,
  window: config.rateLimit.windowMillis,
});
