import { Hono } from "hono"
import type { Application } from "../application"
import { createAdminApi, createDeviceApi } from "../modules"
import { jsonBodyLimit, securityHeaders } from "./middleware/request"
import { errorResponse } from "./responses/error"
import { staticFile } from "../static/files"
import type { HttpEnvironment } from "./types"
import { RequestStore } from "../frame/core"
import { requestContext } from "../frame/hono/request-context"
import { requestLogger } from "../frame/hono/request-logger"
import { rateLimit } from "../frame/security/rate-limit"
import { operation } from "./openapi"
import { Health } from "../frame/health/checker"

export function createHttpApp(application: Application): Hono<HttpEnvironment> {
  const app = new Hono<HttpEnvironment>()

  app.use("*", requestContext)
  app.use("*", requestLogger())
  app.use("*", securityHeaders())
  app.use("*", rateLimit({
    name: "http",
    limit: application.config.rateLimitMaximum,
    windowMillis: application.config.rateLimitWindowMs,
  }))
  app.use("*", jsonBodyLimit())

  Health.register({ name: "database", check: () => application.database.check() })

  app.get("/health/live", operation({ operationId: "getLiveness", tags: ["Health"], summary: "Check process liveness", auth: false }), (c) => c.json({ status: "ok" }))
  app.get("/health/ready", operation({ operationId: "getReadiness", tags: ["Health"], summary: "Check service readiness", auth: false }), async (c) => {
    const result = await Health.checkReady()
    return result.ok
      ? c.json({ status: "ready" })
      : c.json({ status: "not-ready", failed: result.failed }, 503)
  })

  app.route("/api/v1", createDeviceApi(application))
  app.route("/admin/api/v1", createAdminApi(application))

  app.all("/api/*", (c) => c.json({
    error: {
      code: "not_found",
      message: "Resource not found",
      requestId: RequestStore.get("requestId") ?? "unknown",
      details: {},
    },
  }, 404))
  app.all("/admin/api/*", (c) => c.json({
    error: {
      code: "not_found",
      message: "Resource not found",
      requestId: RequestStore.get("requestId") ?? "unknown",
      details: {},
    },
  }, 404))

  app.get("*", async (c) => {
    const response = await staticFile(application.config.webRoot, new URL(c.req.url).pathname)
    return response ?? c.json({
      error: {
        code: "not_found",
        message: "Resource not found",
        requestId: RequestStore.get("requestId") ?? "unknown",
        details: {},
      },
    }, 404)
  })

  app.notFound((c) => c.json({
    error: {
      code: "not_found",
      message: "Resource not found",
      requestId: RequestStore.get("requestId") ?? "unknown",
      details: {},
    },
  }, 404))
  app.onError((error, c) => errorResponse(c, error))
  return app
}
