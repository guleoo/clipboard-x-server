import { SystemError } from "../core";
import { HttpError } from "../hono/error";

export class AuthError extends HttpError {
  constructor(message = "Unauthorized", options?: ErrorOptions) {
    super(401, message, undefined, options);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden", options?: ErrorOptions) {
    super(403, message, undefined, options);
  }
}

export class RateLimitError extends HttpError<{
  readonly limit: number;
  readonly ttl: number;
}> {
  constructor(message: string, limit: number, ttl: number) {
    super(429, message, { limit, ttl });
  }
}

export class PermissionDefinitionError extends SystemError {}
export class PasswordHashError extends SystemError {}
