import { mkdirSync } from "node:fs";
import * as path from "node:path";
import * as winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import type { ResolvedLoggerOptions } from "./config";
import { createLogFormat } from "./format";
import { reportLoggerError } from "./serialize";

function createConsoleTransport(
  options: ResolvedLoggerOptions["console"],
): winston.transport {
  return new winston.transports.Console({
    level: options.level,
    format: createLogFormat(true),
  });
}

function createFileTransport(
  options: ResolvedLoggerOptions["file"],
): winston.transport {
  mkdirSync(path.resolve(options.dir), { recursive: true });
  return new DailyRotateFile({
    level: options.level,
    dirname: options.dir,
    filename: options.filename,
    datePattern: "YYYY-MM-DD",
    maxFiles: options.maxFiles,
    maxSize: options.maxSize,
    zippedArchive: options.zippedArchive,
    format: createLogFormat(),
  });
}

export function createRootLogger(
  options: ResolvedLoggerOptions,
): winston.Logger {
  const transports: winston.transport[] = [];
  if (options.console.enabled) {
    transports.push(createConsoleTransport(options.console));
  }
  if (options.file.enabled) {
    transports.push(createFileTransport(options.file));
  }

  const logger = winston.createLogger({
    // Each transport filters independently, so root accepts the lowest level.
    level: "debug",
    defaultMeta: options.defaultMeta,
    transports,
    silent: transports.length === 0,
    exitOnError: false,
  });

  logger.on("error", (error: unknown, transport?: winston.transport) => {
    const name = transport?.constructor?.name ?? "root";
    reportLoggerError(name, error);
  });
  return logger;
}

export function closeRootLogger(logger: winston.Logger): Promise<void> {
  if (logger.writableFinished) {
    logger.close();
    return Promise.resolve();
  }

  const transports = [...logger.transports];
  return new Promise((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      resolve();
    };

    logger.once("finish", () => {
      const closing = transports.flatMap((transport) => {
        if (typeof transport.close !== "function") return [];
        return [
          new Promise<void>((transportClosed) => {
            transport.once("finish", transportClosed);
            try {
              transport.close?.();
            } catch (error) {
              reportLoggerError("transport-close", error);
              transportClosed();
            }
          }),
        ];
      });
      void Promise.all(closing).then(() => {
        logger.close();
        done();
      });
    });
    try {
      logger.end();
    } catch (error) {
      reportLoggerError("close", error);
      logger.close();
      done();
    }
  });
}
