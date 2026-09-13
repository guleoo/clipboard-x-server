export type Fields<Value = unknown> = Record<string, Value>;

export function iife<Value>(callback: () => Value): Value {
  return callback();
}

export function stringify(input: unknown): string {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

export function clean(input: Fields = {}): Fields {
  const result: Fields = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== null && value !== undefined) result[key] = value;
  }
  return result;
}
