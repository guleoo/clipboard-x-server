import { reportLoggerError } from "./serialize";

export interface ConsoleOutput {
  write(content: string): void;
}

interface WritableConsole {
  write(content: string): unknown;
}

/** Raw human-facing console output for banners and CLI messages. */
export function createConsoleOutput(
  enabled: boolean,
  output: WritableConsole = process.stdout,
): ConsoleOutput {
  if (!enabled) return { write() {} };

  return {
    write(content) {
      try {
        output.write(content);
      } catch (error) {
        reportLoggerError("console-write", error);
      }
    },
  };
}
