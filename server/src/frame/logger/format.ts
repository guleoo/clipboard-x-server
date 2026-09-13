import * as winston from "winston";
import { DateFormat, now } from "../core/date";
import { safeStringify, sanitizeFields, safeText } from "./serialize";
import type { LogFormat } from "./type";

interface LogInfo {
  readonly timestamp?: unknown;
  readonly level?: unknown;
  readonly service?: unknown;
  readonly message?: unknown;
  readonly stack?: unknown;
  readonly [key: string]: unknown;
}

export function renderPretty(info: LogInfo): string {
  const { timestamp, level, service, message, stack, ...meta } = info;
  const servicePrefix =
    service === undefined || service === null || service === ""
      ? ""
      : ` [${safeText(service)}]`;
  const fields = sanitizeFields(meta);
  const serializedMeta =
    Object.keys(fields).length > 0 ? ` ${safeStringify(fields)}` : "";
  return `${safeText(timestamp)} [${safeText(level)}]${servicePrefix} ${safeText(stack ?? message)}${serializedMeta}`;
}

export function renderJsonLine(info: LogInfo): string {
  const { timestamp, level, service, message, ...meta } = info;
  return safeStringify({
    timestamp,
    level,
    service,
    message,
    ...meta,
  });
}

export function createLogFormat(format: LogFormat, colorize = false) {
  const formats: winston.Logform.Format[] = [];
  if (colorize && format === "pretty") {
    formats.push(winston.format.colorize());
  }
  formats.push(
    winston.format.timestamp(
      format === "pretty" ? { format: () => DateFormat.human(now()) } : undefined,
    ),
    winston.format.printf(format === "json" ? renderJsonLine : renderPretty),
  );
  return winston.format.combine(...formats);
}
