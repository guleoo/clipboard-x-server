import axios, { AxiosError, type AxiosInstance } from "axios"
import { RequestError, type Call, type Method, type ResponseMode } from "./types"

interface ErrorDocument {
  readonly error?: {
    readonly code?: string
    readonly message?: string
    readonly requestId?: string
  }
}

export interface TransportRequest extends Call {
  readonly method: Method
  readonly url: string
  readonly response: ResponseMode
}

export interface Transport {
  send(request: TransportRequest): Promise<unknown>
}

function map(error: unknown): RequestError {
  if (!(error instanceof AxiosError)) {
    return new RequestError("network", "请求失败", undefined, undefined, undefined, { cause: error })
  }
  if (axios.isCancel(error)) return new RequestError("canceled", "请求已取消", undefined, undefined, undefined, { cause: error })
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return new RequestError("timeout", "请求超时", undefined, undefined, undefined, { cause: error })
  }
  const document = error.response?.data as ErrorDocument | undefined
  const status = error.response?.status
  const code = document?.error?.code
  const category = status === 401 ? "auth" : code ? "business" : status ? "http" : "network"
  return new RequestError(
    category,
    document?.error?.message ?? (status ? `请求失败（HTTP ${status}）` : "无法连接服务器"),
    status,
    code,
    document?.error?.requestId,
    { cause: error },
  )
}

export function create(): Transport {
  const http: AxiosInstance = axios.create({ timeout: 15_000, withCredentials: true })
  return {
    async send(request) {
      try {
        const result = await http.request({
          method: request.method,
          url: request.url,
          responseType: request.response === "blob" ? "blob" : "json",
          ...(request.query === undefined ? {} : { params: request.query }),
          ...(request.body === undefined ? {} : { data: request.body }),
          ...(request.headers === undefined ? {} : { headers: request.headers }),
          ...(request.timeoutMillis === undefined ? {} : { timeout: request.timeoutMillis }),
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        })
        return request.response === "empty" ? undefined : result.data
      } catch (error) {
        throw map(error)
      }
    },
  }
}
