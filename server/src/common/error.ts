export type ErrorCode =
  | "invalid_request"
  | "invalid_key"
  | "not_authenticated"
  | "not_authorized"
  | "device_disabled"
  | "device_mismatch"
  | "virtual_device_immutable"
  | "virtual_device_membership_immutable"
  | "virtual_device_receive_forbidden"
  | "channel_forbidden"
  | "not_found"
  | "item_conflict"
  | "content_not_ready"
  | "source_content_missing"
  | "too_large"
  | "hash_mismatch"
  | "transfer_expired"
  | "rate_limited"
  | "internal_error"

export class DomainError extends ServiceError<{
  readonly errorCode: ErrorCode
  readonly httpStatus: number
  readonly details?: Readonly<Record<string, unknown>>
}> {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Readonly<Record<string, unknown>>,
    options?: ErrorOptions,
  ) {
    super(
      FrameErrorCode.of(status, message),
      { errorCode, httpStatus: status, ...(details ? { details } : {}) },
      options,
    )
  }
}

export function invalid(message: string, details?: Readonly<Record<string, unknown>>): DomainError {
  return new DomainError("invalid_request", message, 400, details)
}

export function notFound(message = "Resource not found"): DomainError {
  return new DomainError("not_found", message, 404)
}
import { ErrorCode as FrameErrorCode, ServiceError } from "../frame/core"
