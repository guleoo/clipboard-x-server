import type {
  ClientErrorStatusCode,
  ServerErrorStatusCode,
} from "hono/utils/http-status";
import { BaseError, type ErrorData } from "../core";

export type HttpErrorStatus = ClientErrorStatusCode | ServerErrorStatusCode;

/** An expected HTTP-boundary failure with a governed error status. */
export class HttpError<
  Data extends ErrorData = ErrorData,
> extends BaseError<Data> {
  constructor(
    readonly status: HttpErrorStatus,
    message: string,
    data?: Data,
    options?: ErrorOptions,
  ) {
    super(message, data, options);
  }
}
