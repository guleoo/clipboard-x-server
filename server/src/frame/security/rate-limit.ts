import { createHash } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { Lifecycle } from "../core";
import { RateLimitError } from "./error";

export interface RateLimitOptions {
  readonly name: string;
  readonly windowMillis: number;
  readonly limit: number;
  readonly message?: string;
  readonly key?: (context: Parameters<MiddlewareHandler>[0]) => string | Promise<string>;
  readonly skip?: (context: Parameters<MiddlewareHandler>[0]) => boolean | Promise<boolean>;
}

interface Counter {
  count: number;
  expiresAt: number;
}

const counters = new Map<string, Counter>();
const MAX_COUNTERS = 10_000;
Lifecycle.register({
  name: "rate-limit",
  on: "shutdown",
  phase: "dispose",
  order: 30,
  event: () => counters.clear(),
});

function clientIp(context: Parameters<MiddlewareHandler>[0]): string {
  return (
    context.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    context.req.header("x-real-ip") ||
    "127.0.0.1"
  );
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  if (!options.name.trim()) throw new RateLimitError("Rate limit name is required", 1, 0);
  if (!Number.isSafeInteger(options.limit) || options.limit <= 0) {
    throw new RateLimitError("Rate limit must be a positive integer", 1, 0);
  }
  if (!Number.isSafeInteger(options.windowMillis) || options.windowMillis <= 0) {
    throw new RateLimitError("Rate limit window must be positive", options.limit, 0);
  }

  return createMiddleware(async (context, next) => {
    if (await options.skip?.(context)) return next();
    const rawKey = await (options.key ?? clientIp)(context);
    const hash = createHash("sha256").update(rawKey).digest("base64url");
    const key = `${options.name}:${hash}`;
    const now = Date.now();
    if (counters.size >= MAX_COUNTERS) {
      for (const [counterKey, value] of counters) {
        if (value.expiresAt <= now) counters.delete(counterKey);
      }
      if (counters.size >= MAX_COUNTERS) {
        const oldest = counters.keys().next().value as string | undefined;
        if (oldest) counters.delete(oldest);
      }
    }
    const current = counters.get(key);
    const counter =
      !current || current.expiresAt <= now
        ? { count: 1, expiresAt: now + options.windowMillis }
        : { ...current, count: current.count + 1 };
    counters.set(key, counter);
    const remaining = Math.max(options.limit - counter.count, 0);
    const ttl = Math.max(counter.expiresAt - now, 0);
    context.header("X-RateLimit-Limit", String(options.limit));
    context.header("X-RateLimit-Remaining", String(remaining));
    context.header("X-RateLimit-Reset", String(Math.ceil(ttl / 1_000)));
    if (counter.count > options.limit) {
      throw new RateLimitError(
        options.message ?? "Too many requests",
        options.limit,
        ttl,
      );
    }
    await next();
  });
}
