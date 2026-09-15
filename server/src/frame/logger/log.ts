import { Lifecycle } from "../core/lifecycle";
import { FrameConfig } from "../config";
import { createConsoleOutput, type ConsoleOutput } from "./console";
import { resolveLoggerOptions } from "./config";
import { LoggerError } from "./error";
import { createLogPayload } from "./payload";
import {
  reportLoggerError,
  safeText,
  sanitizeError,
  sanitizeFields,
} from "./serialize";
import { createLogTimer } from "./timer";
import { closeRootLogger, createRootLogger } from "./transport";
import type {
  Logger as FrameLogger,
  LogFields,
  LogFormat,
  LogLevel,
  LogOptions,
  LogTags,
  LogTagValue,
  LogTimer,
} from "./type";

let root: ReturnType<typeof createRootLogger> | undefined;
let initialized = false;
let closed = false;
let closePromise: Promise<void> | undefined;
let consoleOutput: ConsoleOutput | undefined;
const serviceCache = new Map<string, FrameLogger>();

function activeRoot(): ReturnType<typeof createRootLogger> | undefined {
  if (!closed) return root;
  reportLoggerError("closed", "Log write ignored because Logger is closed");
  return undefined;
}

export namespace Log {
  export type Level = LogLevel;
  export type Format = LogFormat;
  export type TagValue = LogTagValue;
  export type Tags = LogTags;
  export type Fields = LogFields;
  export type Options = LogOptions;
  export type Timer = LogTimer;
  export type Logger = FrameLogger;

  /** Raw terminal output for banners and CLI messages; it bypasses log transports. */
  export namespace Console {
    export function write(content: string): void {
      if (closed) return;
      consoleOutput?.write(content);
    }
  }

  /** Initialize the process-wide Logger exactly once during application startup. */
  export function init(options: Options = {}): void {
    if (initialized) {
      throw new LoggerError("Logger has already been initialized");
    }

    const resolved = resolveLoggerOptions(options);
    const nextRoot = createRootLogger(resolved);
    try {
      Lifecycle.register({
        name: "frame-logger",
        on: "shutdown",
        phase: "flush",
        order: 100,
        event: flush,
      });
    } catch (error) {
      void closeRootLogger(nextRoot);
      throw error;
    }

    root = nextRoot;
    consoleOutput = createConsoleOutput(resolved.console.enabled);
    initialized = true;
  }

  /** Stop accepting log events and wait for all transports to finish. */
  export function flush(): Promise<void> {
    if (closePromise) return closePromise;
    closed = true;
    const current = root;
    root = undefined;
    consoleOutput = undefined;
    closePromise = current ? closeRootLogger(current) : Promise.resolve();
    return closePromise;
  }

  export function create(tags: Tags = {}): Logger {
    const service =
      typeof tags.service === "string" ? tags.service : undefined;
    const serviceOnly = service !== undefined && Object.keys(tags).length === 1;
    if (serviceOnly) {
      const cached = serviceCache.get(service);
      if (cached) return cached;
    }

    const state: Readonly<Tags> = Object.freeze({ ...tags });

    const write = (level: Level, message?: unknown, extra?: Fields) => {
      try {
        const target = activeRoot();
        if (!target) return;
        if (!target.isLevelEnabled(level)) return;

        const error = sanitizeError(message);
        const payload = createLogPayload(state, extra, error?.value);
        target.log(level, error?.message ?? safeText(message), payload);
      } catch (error) {
        reportLoggerError("write", error);
      }
    };

    const logger: Logger = {
      debug(message, extra) {
        write("debug", message, extra);
      },
      info(message, extra) {
        write("info", message, extra);
      },
      warn(message, extra) {
        write("warn", message, extra);
      },
      error(message, extra) {
        write("error", message, extra);
      },
      child(tags) {
        const nextState = { ...state, ...tags };
        const keys = Object.keys(nextState);
        const unchanged =
          keys.length === Object.keys(state).length &&
          keys.every((key) => Object.is(nextState[key], state[key]));
        return unchanged ? logger : create(nextState);
      },
      time(message, extra) {
        logger.info(message, { ...sanitizeFields(extra), status: "started" });
        return createLogTimer((status, fields) => {
          if (status === "failed") logger.error(message, fields);
          else logger.info(message, fields);
        }, extra);
      },
    };

    if (serviceOnly) serviceCache.set(service, logger);
    return logger;
  }

  export const Default = create({ service: "default" });
}

Log.init(FrameConfig.Logger);
