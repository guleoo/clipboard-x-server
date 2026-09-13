import { BaseError } from "./error";

export type LifecycleEvent = "shutdown";
export type LifecyclePhase = "quiesce" | "drain" | "stop" | "dispose" | "flush";
export type LifecycleReason =
  | "manual"
  | "SIGINT"
  | "SIGTERM"
  | "uncaughtException"
  | "unhandledRejection";
export type LifecycleState = "running" | "shutting-down" | "shutdown";

export interface LifecycleContext {
  readonly on: LifecycleEvent;
  readonly reason: LifecycleReason;
  readonly signal?: NodeJS.Signals;
  readonly abortSignal: AbortSignal;
}

export interface LifecycleTimeoutContext extends LifecycleContext {
  readonly name: string;
  readonly timeout: number;
}

export interface LifecycleHandler {
  readonly name: string;
  readonly on: LifecycleEvent;
  readonly phase: LifecyclePhase;
  readonly order?: number;
  readonly timeout?: number;
  event(context: LifecycleContext): Promise<void> | void;
  onTimeout?(context: LifecycleTimeoutContext): boolean;
}

export interface LifecycleShutdownOptions {
  readonly reason: LifecycleReason;
  readonly signal?: NodeJS.Signals;
}

export class LifecycleError extends BaseError {}

const PHASES: readonly LifecyclePhase[] = [
  "quiesce",
  "drain",
  "stop",
  "dispose",
  "flush",
];
const DEFAULT_TIMEOUT = 5_000;
const handlers: LifecycleHandler[] = [];
let hooksInstalled = false;
let shutdownPromise: Promise<void> | undefined;
let state: LifecycleState = "running";
let exitRequested = false;
let requestedExitCode = 0;

function recordRuntimeError(
  event: "uncaughtException" | "unhandledRejection",
  error: unknown,
): void {
  console.error(`[Lifecycle] ${event}`, error);
}

function shutdownAndExit(
  options: LifecycleShutdownOptions,
  exitCode = 0,
): void {
  requestedExitCode = Math.max(requestedExitCode, exitCode);
  if (exitRequested) return;
  exitRequested = true;
  void Lifecycle.shutdown(options).then(
    () => process.exit(requestedExitCode),
    () => process.exit(1),
  );
}

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  process.once("SIGINT", () =>
    shutdownAndExit({ reason: "SIGINT", signal: "SIGINT" }),
  );
  process.once("SIGTERM", () =>
    shutdownAndExit({ reason: "SIGTERM", signal: "SIGTERM" }),
  );
  process.on("uncaughtException", (error) => {
    recordRuntimeError("uncaughtException", error);
    shutdownAndExit({ reason: "uncaughtException" }, 1);
  });
  process.on("unhandledRejection", (error) => {
    recordRuntimeError("unhandledRejection", error);
    shutdownAndExit({ reason: "unhandledRejection" }, 1);
  });
}

function assertHandler(handler: LifecycleHandler): void {
  if (state !== "running") {
    throw new LifecycleError(
      `Cannot register lifecycle handler while state is ${state}`,
    );
  }
  if (!handler.name.trim()) throw new LifecycleError("Lifecycle handler name is required");
  if (
    handler.timeout !== undefined &&
    (!Number.isFinite(handler.timeout) || handler.timeout <= 0)
  ) {
    throw new LifecycleError(
      `Lifecycle handler timeout must be positive: ${handler.name}`,
    );
  }
}

function compareHandlers(left: LifecycleHandler, right: LifecycleHandler): number {
  return (
    PHASES.indexOf(left.phase) - PHASES.indexOf(right.phase) ||
    (left.order ?? 0) - (right.order ?? 0)
  );
}

async function runWithTimeout(
  handler: LifecycleHandler,
  context: Omit<LifecycleContext, "abortSignal">,
): Promise<void> {
  const timeout = handler.timeout ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const fullContext: LifecycleContext = {
    ...context,
    abortSignal: controller.signal,
  };
  const timeoutMarker = Symbol("LifecycleTimeout");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<typeof timeoutMarker>((resolve) => {
    timer = setTimeout(() => resolve(timeoutMarker), timeout);
  });
  const result = await Promise.race([
    Promise.resolve().then(() => handler.event(fullContext)),
    timeoutPromise,
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
  if (result !== timeoutMarker) return;

  controller.abort();
  const handled =
    handler.onTimeout?.({
      ...fullContext,
      name: handler.name,
      timeout,
    }) ?? false;
  if (!handled) {
    throw new LifecycleError(
      `Lifecycle handler timed out after ${timeout}ms: ${handler.name}`,
    );
  }
}

async function runShutdown(options: LifecycleShutdownOptions): Promise<void> {
  const errors: unknown[] = [];
  const context = {
    on: "shutdown" as const,
    reason: options.reason,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
  for (const handler of [...handlers].sort(compareHandlers)) {
    try {
      await runWithTimeout(handler, context);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new LifecycleError("Lifecycle shutdown failed", undefined, {
      cause: new AggregateError(errors),
    });
  }
}

export namespace Lifecycle {
  export function currentState(): LifecycleState {
    return state;
  }

  export function register(handler: LifecycleHandler): () => void {
    assertHandler(handler);
    handlers.push(handler);
    installHooks();
    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      const index = handlers.indexOf(handler);
      if (index >= 0) handlers.splice(index, 1);
    };
  }

  export function shutdown(options: LifecycleShutdownOptions): Promise<void> {
    if (shutdownPromise) return shutdownPromise;
    state = "shutting-down";
    shutdownPromise = runShutdown(options).finally(() => {
      state = "shutdown";
    });
    return shutdownPromise;
  }
}
