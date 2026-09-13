import type { Context } from "hono"
import { ZodError } from "zod"
import { DomainError } from "../../common/error"
import { RequestStore } from "../../frame/core"
import { Log } from "../../frame/logger"
import { HttpError } from "../../frame/hono/error"
import type { HttpEnvironment } from "../types"

const logger = Log.create({ service: "http" })

export function errorResponse(c: Context<HttpEnvironment>, error: unknown): Response {
  const requestId = RequestStore.get("requestId") ?? "unknown"
  if (error instanceof DomainError) {
    return c.json({
      error: {
        code: error.code,
        message: error.message,
        requestId,
        details: error.details ?? {},
      },
    }, error.status as 400)
  }
  if (error instanceof HttpError) {
    return c.json({
      error: {
        code: error.status === 429 ? "rate_limited" : "invalid_request",
        message: error.message,
        requestId,
        details: error.data ?? {},
      },
    }, error.status as 400)
  }
  if (error instanceof ZodError) {
    return c.json({
      error: {
        code: "invalid_request",
        message: "Request validation failed",
        requestId,
        details: {
          issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
      },
    }, 400)
  }
  logger.error(error, { event: "request.failed", requestId })
  return c.json({
    error: {
      code: "internal_error",
      message: "The server could not complete the request",
      requestId,
      details: {},
    },
  }, 500)
}
