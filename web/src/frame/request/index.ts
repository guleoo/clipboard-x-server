import { RequestError, type Bound, type Call, type Endpoint } from "./types"
import { create as createTransport, type Transport } from "./transport"

function pathOf(template: string, values: Readonly<Record<string, string>> = {}): string {
  return template.replace(/:([A-Za-z][A-Za-z0-9]*)/gu, (_, key: string) => {
    const value = values[key]
    if (value === undefined) throw new RequestError("protocol", `缺少路径参数：${key}`)
    return encodeURIComponent(value)
  })
}

export class Client {
  static create(): Client {
    return new Client(createTransport())
  }

  private constructor(private readonly transport: Transport) {}

  bind<Input extends Call, Output>(endpoint: Endpoint<Input, Output>): Bound<Input, Output> {
    return async (input: Input) => {
      const call = endpoint.input?.(input) ?? input
      const value = await this.transport.send({
        method: endpoint.method,
        url: pathOf(endpoint.path, call.path),
        response: endpoint.response,
        ...(call.query === undefined ? {} : { query: call.query }),
        ...(call.body === undefined ? {} : { body: call.body }),
        ...(call.headers === undefined ? {} : { headers: call.headers }),
        ...(call.timeoutMillis === undefined ? {} : { timeoutMillis: call.timeoutMillis }),
        ...(call.signal === undefined ? {} : { signal: call.signal }),
      })
      try {
        return endpoint.decode(value)
      } catch (cause) {
        if (cause instanceof RequestError) throw cause
        throw new RequestError("protocol", `服务器响应不符合 ${endpoint.operation} 协议`, undefined, undefined, undefined, { cause })
      }
    }
  }
}

export function define<Input extends Call, Output>(endpoint: Endpoint<Input, Output>): Endpoint<Input, Output> {
  return Object.freeze(endpoint)
}

export const Request = { Client, define }
export { RequestError }
export type { Bound, Call, Endpoint }
