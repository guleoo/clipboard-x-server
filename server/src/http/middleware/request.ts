import type { MiddlewareHandler } from "hono"
import { bodyLimit } from "hono/body-limit"
import { DomainError } from "../../common/error"
import type { HttpEnvironment } from "../types"

const buckets = new Map<string, { count: number; resetAt: number }>()

export function requestContext(): MiddlewareHandler<HttpEnvironment> {
  return async (c, next) => {
    const requestId = c.req.header("x-request-id")?.slice(0, 128) || crypto.randomUUID()
    c.set("requestId", requestId)
    c.header("X-Request-Id", requestId)
    const startedAt = performance.now()
    await next()
    c.header("X-Content-Type-Options", "nosniff")
    c.header("X-Frame-Options", "DENY")
    c.header("Referrer-Policy", "no-referrer")
    c.header("Content-Security-Policy", "default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
    console.info(JSON.stringify({
      level: "info",
      event: "http.request",
      requestId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    }))
  }
}

export function rateLimit(maximum = 600, windowMs = 60_000): MiddlewareHandler<HttpEnvironment> {
  return async (c, next) => {
    const key = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
      || c.req.header("cf-connecting-ip")
      || "local"
    const now = Date.now()
    const current = buckets.get(key)
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current
    bucket.count += 1
    buckets.set(key, bucket)
    c.header("RateLimit-Limit", String(maximum))
    c.header("RateLimit-Remaining", String(Math.max(0, maximum - bucket.count)))
    c.header("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)))
    if (bucket.count > maximum) {
      throw new DomainError("rate_limited", "Too many requests", 429)
    }
    await next()
  }
}

export function jsonBodyLimit(maximum = 256 * 1024): MiddlewareHandler<HttpEnvironment> {
  const enforce = bodyLimit({
    maxSize: maximum,
    onError() {
      throw new DomainError("too_large", "JSON request body is too large", 413)
    },
  })
  return async (c, next) => {
    const contentType = c.req.header("content-type") ?? ""
    if (!["GET", "HEAD"].includes(c.req.method) && contentType.includes("application/json")) {
      return enforce(c, next)
    }
    return next()
  }
}
