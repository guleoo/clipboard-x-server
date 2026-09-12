import type { Context } from "hono"
import { ZodError } from "zod"
import { DomainError } from "../../common/error"
import type { HttpEnvironment } from "../types"

export function errorResponse(c: Context<HttpEnvironment>, error: unknown): Response {
  const requestId = c.get("requestId")
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
  console.error(JSON.stringify({
    level: "error",
    event: "request.failed",
    requestId,
    message: error instanceof Error ? error.message : "Unknown error",
  }))
  return c.json({
    error: {
      code: "internal_error",
      message: "The server could not complete the request",
      requestId,
      details: {},
    },
  }, 500)
}
