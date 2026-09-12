export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
export type ResponseMode = "json" | "blob" | "empty"

export interface Call {
  readonly path?: Readonly<Record<string, string>>
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>
  readonly body?: unknown
  readonly signal?: AbortSignal
}

export interface Endpoint<Input extends Call, Output> {
  readonly operation: string
  readonly method: Method
  readonly path: string
  readonly auth: boolean
  readonly response: ResponseMode
  readonly decode: (value: unknown) => Output
  readonly input?: (value: Input) => Call
}

export type Bound<Input extends Call, Output> = (input: Input) => Promise<Output>

export type Category = "network" | "timeout" | "canceled" | "http" | "business" | "protocol" | "auth"

export class RequestError extends Error {
  readonly name = "RequestError"

  constructor(
    public readonly category: Category,
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly requestId?: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}
