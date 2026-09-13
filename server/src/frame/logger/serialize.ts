import { isError } from "../core/error";
import type { LogFields } from "./type";

const circularMarker = "[Circular]";
const inaccessibleMarker = "[Inaccessible]";

function errorMessage(error: unknown): string {
  try {
    if (error instanceof Error) return error.message || error.name || "Error";
    return String(error);
  } catch {
    return "Unknown error";
  }
}

function propertyValue(target: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (!descriptor) return inaccessibleMarker;
    if ("value" in descriptor) return descriptor.value;
    return inaccessibleMarker;
  } catch {
    return inaccessibleMarker;
  }
}

function inheritedValue(target: object, key: PropertyKey): unknown {
  try {
    return Reflect.get(target, key);
  } catch {
    return inaccessibleMarker;
  }
}

function enumerableEntries(
  target: object,
): readonly (readonly [string, unknown])[] {
  try {
    return Reflect.ownKeys(target).flatMap((key) => {
      // Winston symbols carry internal state and are not application log fields.
      if (typeof key === "symbol") return [];
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Object.getOwnPropertyDescriptor(target, key);
      } catch {
        return [];
      }
      if (!descriptor?.enumerable) return [];
      return [[key, propertyValue(target, key)] as const];
    });
  } catch {
    return [];
  }
}

function errorObject(
  error: Error,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const result = Object.create(null) as Record<string, unknown>;
  result.name = safeText(inheritedValue(error, "name")) || "Error";
  result.message = safeText(inheritedValue(error, "message"));
  const stack = inheritedValue(error, "stack");
  const cause = inheritedValue(error, "cause");
  if (typeof stack === "string") result.stack = stack;
  if (cause !== undefined && cause !== inaccessibleMarker) {
    result.cause = sanitize(cause, seen);
  }

  for (const [key, value] of enumerableEntries(error)) {
    if (!(key in result) && key !== "cause") {
      result[key] = sanitize(value, seen);
    }
  }
  return result;
}

function arrayValue(
  input: readonly unknown[],
  seen: WeakSet<object>,
): readonly unknown[] {
  const result: unknown[] = [];
  let length = 0;
  try {
    length = input.length;
  } catch {
    return [inaccessibleMarker];
  }
  for (let index = 0; index < length; index++) {
    result.push(sanitize(propertyValue(input, String(index)), seen));
  }
  return result;
}

function objectValue(
  input: object,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const result = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of enumerableEntries(input)) {
    result[key] = sanitize(value, seen);
  }
  return result;
}

export function sanitize(
  input: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (
    input === null ||
    input === undefined ||
    typeof input === "string" ||
    typeof input === "boolean"
  ) {
    return input;
  }
  if (typeof input === "number") {
    return Number.isFinite(input) ? input : String(input);
  }
  if (typeof input === "bigint") return input.toString();
  if (typeof input === "symbol") return safeText(input);
  if (typeof input === "function") {
    return input.name ? `[Function: ${input.name}]` : "[Function]";
  }
  if (typeof input !== "object") return safeText(input);
  if (seen.has(input)) return circularMarker;
  seen.add(input);

  if (input instanceof Error) return errorObject(input, seen);
  if (input instanceof Date) {
    try {
      return input.toISOString();
    } catch {
      return "Invalid Date";
    }
  }
  const toJSON = inheritedValue(input, "toJSON");
  if (typeof toJSON === "function") {
    try {
      const value = Reflect.apply(toJSON, input, []);
      if (value !== input) return sanitize(value, seen);
    } catch {
      // A broken toJSON implementation must not interrupt logging.
    }
  }
  if (Array.isArray(input)) return arrayValue(input, seen);
  return objectValue(input, seen);
}

export function sanitizeFields(fields?: LogFields): LogFields {
  if (!fields) return {};
  const value = sanitize(fields);
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? (value as LogFields)
    : {};
}

export function sanitizeError(
  input: unknown,
): { readonly message: string; readonly value: unknown } | undefined {
  try {
    if (!isError(input)) return undefined;
  } catch {
    return undefined;
  }

  const value = sanitize(input);
  const message =
    typeof value === "object" && value !== null && "message" in value
      ? safeText((value as Record<string, unknown>).message)
      : safeText(input);
  return { message, value };
}

export function safeStringify(input: unknown): string {
  try {
    return JSON.stringify(sanitize(input)) ?? "null";
  } catch (error) {
    return JSON.stringify({ serializationError: errorMessage(error) });
  }
}

export function safeText(input: unknown): string {
  if (input === undefined) return "";
  try {
    if (input instanceof Error) return input.message || input.name || "Error";
    return String(input);
  } catch (error) {
    return `[Unprintable: ${errorMessage(error)}]`;
  }
}

export function reportLoggerError(scope: string, error: unknown): void {
  try {
    process.stderr.write(`[Logger:${scope}] ${safeText(error)}\n`);
  } catch {
    // Logger failures must degrade silently instead of recursively logging.
  }
}
