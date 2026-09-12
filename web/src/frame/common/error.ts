export function errorOf(value: unknown): Error {
  return value instanceof Error ? value : new Error("发生了未知错误", { cause: value })
}
