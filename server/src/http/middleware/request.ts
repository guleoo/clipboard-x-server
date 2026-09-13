import type { MiddlewareHandler } from "hono"
import { bodyLimit } from "hono/body-limit"
import { DomainError } from "../../common/error"
import type { HttpEnvironment } from "../types"

export function securityHeaders(): MiddlewareHandler<HttpEnvironment> {
  return async (c, next) => {
    await next()
    c.header("X-Content-Type-Options", "nosniff")
    c.header("X-Frame-Options", "DENY")
    c.header("Referrer-Policy", "no-referrer")
    c.header("Content-Security-Policy", "default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
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
