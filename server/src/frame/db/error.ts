import { BaseError } from "../core";

export class DbError extends BaseError {}

export function databaseError(message: string, cause?: unknown): DbError {
  return new DbError(
    message,
    undefined,
    cause === undefined ? undefined : { cause },
  );
}
