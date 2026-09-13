import { AsyncStore } from "../core/context";
import type { LogFields } from "./type";

const contextFields = [
  "requestId",
  "tenantId",
  "uid",
  "authType",
] as const;

export function currentLogContext(): LogFields {
  const result: LogFields = {};
  for (const key of contextFields) {
    const value = AsyncStore.get(key);
    if (value !== undefined && value !== null) result[key] = value;
  }
  return result;
}

export function withLogContext(fields: LogFields): LogFields {
  return {
    ...fields,
    ...currentLogContext(),
  };
}
