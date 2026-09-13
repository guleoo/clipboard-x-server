import { isMainThread, threadId } from "node:worker_threads";

export type Runtime = "main" | "worker" | "child_process";

function declaredRuntime(value: string | undefined): Runtime | undefined {
  if (value === "main" || value === "worker" || value === "child_process") {
    return value;
  }
  return undefined;
}

export function currentRuntime(): Runtime {
  const declared = declaredRuntime(process.env.APP_RUNTIME);
  if (declared) return declared;
  if (!isMainThread) return "worker";
  if (typeof process.send === "function") return "child_process";
  return "main";
}

export function currentPid(runtime: Runtime = currentRuntime()): number {
  return runtime === "worker" ? threadId : process.pid;
}

export function getAppName(): string | undefined {
  const value = (globalThis as { APPLICATION_NAME?: unknown }).APPLICATION_NAME;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function isWebRuntime(): boolean {
  return "window" in globalThis && "document" in globalThis;
}
