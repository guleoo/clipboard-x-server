import { Hono } from "hono"
import type { Application } from "../application"
import { createAdminApi } from "../admin-api/routes"
import { createDeviceApi } from "../device-api/routes"
import { deviceAuth } from "./middleware/auth"
import { jsonBodyLimit, rateLimit, requestContext } from "./middleware/request"
import { errorResponse } from "./responses/error"
import { staticFile } from "../static/files"
import type { HttpEnvironment } from "./types"

export function createHttpApp(application: Application): Hono<HttpEnvironment> {
  const app = new Hono<HttpEnvironment>()

  app.use("*", requestContext())
  app.use("*", rateLimit())
  app.use("*", jsonBodyLimit())

  app.get("/health/live", (c) => c.json({ status: "ok" }))
  app.get("/health/ready", (c) => {
    try {
      application.database.raw.query("SELECT 1").get()
      return c.json({ status: "ready" })
    } catch {
      return c.json({ status: "not-ready" }, 503)
    }
  })

  const deviceApi = new Hono<HttpEnvironment>()
  deviceApi.use("*", deviceAuth(application))
  deviceApi.route("/", createDeviceApi(application))
  app.route("/api/v1", deviceApi)
  app.route("/admin/api/v1", createAdminApi(application))

  app.all("/api/*", (c) => c.json({
    error: {
      code: "not_found",
      message: "Resource not found",
      requestId: c.get("requestId"),
      details: {},
    },
  }, 404))
  app.all("/admin/api/*", (c) => c.json({
    error: {
      code: "not_found",
      message: "Resource not found",
      requestId: c.get("requestId"),
      details: {},
    },
  }, 404))

  app.get("*", async (c) => {
    const response = await staticFile(application.config.webRoot, new URL(c.req.url).pathname)
    return response ?? c.json({
      error: {
        code: "not_found",
        message: "Resource not found",
        requestId: c.get("requestId"),
        details: {},
      },
    }, 404)
  })

  app.notFound((c) => c.json({
    error: {
      code: "not_found",
      message: "Resource not found",
      requestId: c.get("requestId"),
      details: {},
    },
  }, 404))
  app.onError((error, c) => errorResponse(c, error))
  return app
}
