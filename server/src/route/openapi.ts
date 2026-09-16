import { openapi, type OpenApiRawOptions } from "../frame/hono/openapi"
import { resolver } from "hono-openapi"
import { ErrorResponseSchema, operationResponseSchemas } from "../dto/response"

const errorResponse = {
  description: "Structured product error",
  content: { "application/json": { schema: resolver(ErrorResponseSchema) } },
}

export interface OperationOptions {
  readonly operationId: string
  readonly tags: string[]
  readonly summary: string
  readonly auth: boolean
  readonly scheme?: "adminSession" | "deviceKey"
  readonly status?: 200 | 201 | 202 | 204
  readonly binary?: boolean
}

export function operation(options: OperationOptions) {
  const status = options.status ?? 200
  const responseSchema = operationResponseSchemas[options.operationId]
  const security = !options.auth
    ? []
    : options.scheme === "adminSession"
      ? [{ adminSession: [] }]
      : [{ deviceKey: [], deviceId: [] }]
  const success = options.binary
    ? { description: "Binary content", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } }
    : status === 204
      ? { description: "Operation succeeded" }
      : {
          description: "Operation succeeded",
          content: { "application/json": { schema: responseSchema ? resolver(responseSchema) : { type: "object" as const } } },
        }
  const responses = {
    [String(status)]: success,
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    409: errorResponse,
    413: errorResponse,
    422: errorResponse,
    429: errorResponse,
    500: errorResponse,
  } as OpenApiRawOptions["responses"]
  return openapi.raw({
    operationId: options.operationId,
    tags: options.tags,
    summary: options.summary,
    auth: options.auth,
    security,
    responses,
  })
}
