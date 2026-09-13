import { BaseError } from "../core";

export interface HealthCheckContext {
  readonly abortSignal: AbortSignal;
}

export interface HealthCheck {
  readonly name: string;
  readonly timeoutMillis?: number;
  check(context: HealthCheckContext): Promise<void> | void;
}

export interface HealthReadyResult {
  readonly ok: boolean;
  readonly checks: readonly { readonly name: string; readonly ok: boolean }[];
  readonly failed: readonly string[];
}

const checks = new Map<string, HealthCheck>();
const DEFAULT_TIMEOUT_MILLIS = 5_000;

export class HealthError extends BaseError {}

async function runCheck(check: HealthCheck): Promise<boolean> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = check.timeoutMillis ?? DEFAULT_TIMEOUT_MILLIS;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, timeout);
  });
  try {
    return await Promise.race([
      Promise.resolve()
        .then(() => check.check({ abortSignal: controller.signal }))
        .then(
          () => true,
          () => false,
        ),
      timedOut,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export namespace Health {
  export function register(check: HealthCheck): void {
    if (!check.name.trim()) throw new HealthError("Health check name is required");
    if (
      check.timeoutMillis !== undefined &&
      (!Number.isSafeInteger(check.timeoutMillis) || check.timeoutMillis <= 0)
    ) {
      throw new HealthError(
        `Health check timeout must be a positive safe integer: ${check.name}`,
      );
    }
    checks.set(check.name, check);
  }

  export function unregister(name: string): void {
    checks.delete(name);
  }

  export function list(): readonly HealthCheck[] {
    return [...checks.values()];
  }

  export async function checkReady(): Promise<HealthReadyResult> {
    const results = await Promise.all(
      [...checks.values()].map(async (check) => {
        const ok = await runCheck(check);
        return { name: check.name, ok };
      }),
    );
    const failed = results.filter(({ ok }) => !ok).map(({ name }) => name);
    return { ok: failed.length === 0, checks: results, failed };
  }
}
