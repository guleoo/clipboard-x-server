import type { LogFields, LogTimer } from "./type";

type TimerStatus = "completed" | "failed";
type CompleteTimer = (status: TimerStatus, fields: LogFields) => void;

export function createLogTimer(
  complete: CompleteTimer,
  baseFields?: LogFields,
): LogTimer {
  const start = performance.now();
  const base = { ...baseFields };
  let completed = false;

  const finish = (
    status: TimerStatus,
    extra?: LogFields,
    error?: unknown,
  ) => {
    if (completed) return;
    completed = true;
    complete(status, {
      ...base,
      ...extra,
      ...(error === undefined ? {} : { error }),
      status,
      durationMillis: Math.max(0, Math.round(performance.now() - start)),
    });
  };

  return {
    stop(extra) {
      finish("completed", extra);
    },
    fail(error, extra) {
      finish("failed", extra, error);
    },
    [Symbol.dispose]() {
      finish("completed");
    },
  };
}
