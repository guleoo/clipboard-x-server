export type ErrorData = Readonly<Record<string, unknown>>;

export class BaseError<Data extends ErrorData = ErrorData> extends Error {
  readonly data?: Data;

  constructor(message?: string, data?: Data, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.data = data;
    Error.captureStackTrace?.(this, new.target);
  }
}

export function isError(input: unknown): input is Error {
  return input instanceof Error;
}

export class SystemError<
  Data extends ErrorData = ErrorData,
> extends BaseError<Data> {}

export interface ErrorCode<
  Code extends number = number,
  Message extends string = string,
> {
  readonly code: Code;
  readonly message: Message;
}

export namespace ErrorCode {
  export function of<const Code extends number, const Message extends string>(
    code: Code,
    message: Message,
  ): ErrorCode<Code, Message> {
    if (!Number.isInteger(code) || code < 0) {
      throw new SystemError(`Error code must be a non-negative integer: ${code}`);
    }
    return Object.freeze({ code, message });
  }

  export function prefix<const Message extends string>(
    prefix: number,
    code: number,
    message: Message,
  ): ErrorCode<number, Message> {
    if (!Number.isInteger(prefix) || prefix < 0 || `${prefix}`.length !== 6) {
      throw new SystemError(
        `Error code prefix must be a six-digit non-negative integer: ${prefix}`,
      );
    }
    if (!Number.isInteger(code) || code < 1 || code > 999) {
      throw new SystemError(
        `Error code suffix must be an integer between 1 and 999: ${code}`,
      );
    }
    return Object.freeze({
      code: Number(`${prefix}${String(code).padStart(3, "0")}`),
      message,
    });
  }
}

export class ServiceError<
  Data extends ErrorData = ErrorData,
> extends BaseError<Data> {
  readonly code: number;

  constructor(error: ErrorCode, data?: Data, options?: ErrorOptions) {
    super(error.message, data, options);
    this.code = error.code;
  }
}
