import { withLogContext } from "./context";
import { sanitizeFields } from "./serialize";
import type { LogFields, LogTags } from "./type";

export function createLogPayload(
  tags: Readonly<LogTags>,
  fields?: LogFields,
  error?: unknown,
): LogFields {
  return sanitizeFields(
    withLogContext({
      ...sanitizeFields(fields),
      ...tags,
      ...(error === undefined ? {} : { error }),
    }),
  );
}
