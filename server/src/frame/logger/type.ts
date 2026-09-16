export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogTagValue = string | number | boolean | null;

export interface LogTags {
  [key: string]: LogTagValue;
}

export interface LogFields {
  [key: string]: unknown;
}

export interface LogTransportOptions {
  readonly enabled?: boolean;
  readonly level?: LogLevel;
}

export interface LogConsoleOptions extends LogTransportOptions {}

export interface LogFileOptions extends LogTransportOptions {
  readonly dir?: string;
  readonly filename?: string;
  readonly maxFiles?: string | number;
  readonly maxSize?: string | number;
  readonly zippedArchive?: boolean;
}

export interface LogOptions {
  readonly defaultMeta?: LogTags;
  readonly console?: LogConsoleOptions;
  readonly file?: LogFileOptions;
}

export interface LogTimer {
  stop(extra?: LogFields): void;
  fail(error?: unknown, extra?: LogFields): void;
  [Symbol.dispose](): void;
}

export interface Logger {
  debug(message?: unknown, extra?: LogFields): void;
  info(message?: unknown, extra?: LogFields): void;
  warn(message?: unknown, extra?: LogFields): void;
  error(message?: unknown, extra?: LogFields): void;
  child(tags: LogTags): Logger;
  time(message: string, extra?: LogFields): LogTimer;
}
