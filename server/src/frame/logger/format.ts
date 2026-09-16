import { inspect, stripVTControlCharacters } from "node:util";
import * as winston from "winston";
import { DateFormat, now } from "../core/date";
import {
  safeStringify,
  sanitize,
  sanitizeFields,
  safeText,
} from "./serialize";

const prettyLineWidth = 120;
const prettyInlineFieldLimit = 5;
const prettyFieldsPerLine = 4;
const simpleText = /^[\p{L}\p{N}._:/@+-]+$/u;

interface LogInfo {
  readonly timestamp?: unknown;
  readonly level?: unknown;
  readonly service?: unknown;
  readonly message?: unknown;
  readonly stack?: unknown;
  readonly [key: string]: unknown;
}

function isScalar(value: unknown): boolean {
  return value === null || value === undefined || ["string", "number", "boolean", "bigint"].includes(typeof value);
}

function renderKey(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key) ? key : JSON.stringify(key);
}

function renderScalarValue(value: unknown): string {
  if (typeof value === "string") return value !== "" && simpleText.test(value) ? value : JSON.stringify(value);
  return safeText(value);
}

function renderScalar(key: string, value: unknown): string {
  return `${renderKey(key)}=${renderScalarValue(value)}`;
}

function visibleLength(value: string): number {
  return stripVTControlCharacters(value).length;
}

function renderScalarLines(tokens: readonly string[]): string[] {
  const lines: string[] = [];
  let current = "  ";
  let count = 0;
  for (const token of tokens) {
    const separator = count === 0 ? "" : "  ";
    const candidate = `${current}${separator}${token}`;
    if (count > 0 && (count >= prettyFieldsPerLine || visibleLength(candidate) > prettyLineWidth)) {
      lines.push(current);
      current = `  ${token}`;
      count = 1;
    } else {
      current = candidate;
      count += 1;
    }
  }
  if (count > 0) lines.push(current);
  return lines;
}

function inspectable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inspectable);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, inspectable(item)]));
}

function renderComplex(key: string, value: unknown): string {
  try {
    const rendered = inspect(inspectable(value), {
      breakLength: 100,
      colors: false,
      compact: false,
      depth: 8,
      getters: false,
      maxArrayLength: 100,
      maxStringLength: 4_000,
    });
    return `  ${renderKey(key)}=${rendered.replaceAll("\n", "\n  ")}`;
  } catch {
    return `  ${renderKey(key)}=${safeStringify(value)}`;
  }
}

function errorStack(fields: Record<string, unknown>, stack: unknown): string | undefined {
  if (typeof stack === "string" && stack !== "") return stack;
  const error = fields.error;
  if (error === null || typeof error !== "object" || Array.isArray(error)) return undefined;
  const value = (error as Record<string, unknown>).stack;
  return typeof value === "string" && value !== "" ? value : undefined;
}

function withoutRenderedStack(fields: Record<string, unknown>, stack: string | undefined): Record<string, unknown> {
  if (!stack) return fields;
  const error = fields.error;
  if (error === null || typeof error !== "object" || Array.isArray(error)) return fields;
  const { name: _name, message: _message, stack: _stack, ...details } = error as Record<string, unknown>;
  const { error: _error, ...rest } = fields;
  return Object.keys(details).length > 0 ? { ...rest, error: details } : rest;
}

export function renderPretty(info: LogInfo): string {
  const { timestamp, level, service, message, stack, ...meta } = info;
  const servicePrefix = service === undefined || service === null || service === "" ? "" : ` [${safeText(service)}]`;
  const fields = sanitizeFields(meta);
  const renderedStack = errorStack(fields, sanitize(stack));
  const entries = Object.entries(withoutRenderedStack(fields, renderedStack));
  const scalarFields = entries.filter(([, value]) => isScalar(value));
  const complexFields = entries.filter(([, value]) => !isScalar(value));
  const scalarTokens = scalarFields.map(([key, value]) => renderScalar(key, value));
  const header = `${safeText(timestamp)} [${safeText(level)}]${servicePrefix} ${safeText(message)}`;
  const inline = `${header}  ${scalarTokens.join("  ")}`;
  const canInline = scalarTokens.length > 0 && scalarTokens.length <= prettyInlineFieldLimit && complexFields.length === 0 && renderedStack === undefined && visibleLength(inline) <= prettyLineWidth;
  if (canInline) return inline;
  const details = [
    ...renderScalarLines(scalarTokens),
    ...complexFields.map(([key, value]) => renderComplex(key, value)),
    ...(renderedStack ? [renderedStack.replace(/^/gm, "  ")] : []),
  ];
  return `${header}${details.length > 0 ? `\n${details.join("\n")}` : ""}`;
}

export function createLogFormat(colorize = false) {
  const formats: winston.Logform.Format[] = [];
  if (colorize) formats.push(winston.format.colorize());
  formats.push(
    winston.format.timestamp({ format: () => DateFormat.human(now()) }),
    winston.format.printf(renderPretty),
  );
  return winston.format.combine(...formats);
}
