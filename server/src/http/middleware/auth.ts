import type { MiddlewareHandler } from "hono"
import { getCookie } from "hono/cookie"
import type { Application } from "../../application"
import { DomainError } from "../../common/error"
import type { HttpEnvironment } from "../types"

export const adminCookieName = "clipboard_x_admin"

function bearer(value: string | undefined): string | undefined {
  if (!value?.startsWith("Bearer ")) return undefined
  return value.slice(7)
}

export function deviceAuth(application: Application): MiddlewareHandler<HttpEnvironment> {
  return async (c, next) => {
    const identity = await application.devices.authenticate(
      bearer(c.req.header("authorization")),
      c.req.header("x-clipboard-x-device-id"),
    )
    c.set("device", identity)
    await next()
  }
}

export function adminAuth(application: Application): MiddlewareHandler<HttpEnvironment> {
  return async (c, next) => {
    const token = getCookie(c, adminCookieName)
    const administrator = application.auth.authenticate(token)
    c.set("administrator", administrator)
    c.set("adminToken", token ?? "")
    await next()
  }
}

export function sameOrigin(application: Application): MiddlewareHandler<HttpEnvironment> {
  return async (c, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next()
    const origin = c.req.header("origin")
    if (!origin) throw new DomainError("not_authorized", "Origin header is required", 403)
    const expected = application.config.publicOrigin ?? new URL(c.req.url).origin
    let actualOrigin: string
    try {
      actualOrigin = new URL(origin).origin
    } catch {
      throw new DomainError("not_authorized", "Origin header is invalid", 403)
    }
    if (actualOrigin !== new URL(expected).origin) {
      throw new DomainError("not_authorized", "Cross-origin administrator request was rejected", 403)
    }
    await next()
  }
}
