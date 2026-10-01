import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { AsyncStore } from "../../src/frame/core";
import { Log } from "../../src/frame/logger";
import { createConsoleOutput } from "../../src/frame/logger/console";
import { resolveLoggerOptions } from "../../src/frame/logger/config";
import { currentLogContext } from "../../src/frame/logger/context";
import { renderPretty } from "../../src/frame/logger/format";
import { safeStringify } from "../../src/frame/logger/serialize";
import { createLogTimer } from "../../src/frame/logger/timer";
import { closeRootLogger, createRootLogger } from "../../src/frame/logger/transport";

describe("logger", () => {
  it("reuses immutable service loggers without collapsing child tags", () => {
    const base = Log.create({ service: "logger-test" });
    expect(Log.create({ service: "logger-test" })).toBe(base);
    expect(base.child({ operation: "create" })).not.toBe(base);
    expect(base.child({})).toBe(base);
  });

  it("reads only approved fields from AsyncStore", () => {
    AsyncStore.run(
      {
        requestId: "request-1",
        tenantId: "tenant-1",
        uid: "user-1",
        authType: "SESSION",
        password: "ignored",
      },
      () => {
        expect(currentLogContext()).toEqual({
          requestId: "request-1",
          tenantId: "tenant-1",
          uid: "user-1",
          authType: "SESSION",
        });
      },
    );
  });

  it("safely serializes hostile and circular values", () => {
    const cyclic: Record<string, unknown> = { count: 1n };
    cyclic.self = cyclic;
    Object.defineProperty(cyclic, "unsafe", {
      enumerable: true,
      get() {
        throw new Error("getter failed");
      },
    });

    expect(JSON.parse(safeStringify(cyclic))).toEqual({
      count: "1",
      self: "[Circular]",
      unsafe: "[Inaccessible]",
    });
  });

  it("renders human-readable log entries", () => {
    const info = {
      timestamp: "2026-09-11T00:00:00.000Z",
      level: "info",
      service: "account",
      message: "Account created",
      accountId: "account-1",
      [Symbol.for("level")]: "info",
    };

    expect(renderPretty(info)).toBe(
      "2026-09-11T00:00:00.000Z [info] [account] Account created  accountId=account-1",
    );
  });

  it("provides raw output for banners without a logging prefix", () => {
    let output = "";
    const consoleOutput = createConsoleOutput(true, {
      write(content) {
        output += content;
      },
    });
    consoleOutput.write("Application ready\n");
    expect(output).toBe("Application ready\n");
    expect(typeof Log.Console.write).toBe("function");
  });

  it("writes human-readable text and closes the file transport", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hono-logger-"));
    const logger = createRootLogger(
      resolveLoggerOptions({
        console: { enabled: false },
        file: {
          enabled: true,
          dir,
          filename: "test-%DATE%.log",
          zippedArchive: false,
        },
      }),
    );

    logger.info("Persisted", { service: "logger-test", count: 1n });
    await closeRootLogger(logger);

    const filename = readdirSync(dir).find((item) => item.endsWith(".log"));
    expect(filename).toBeDefined();
    const content = readFileSync(join(dir, filename!), "utf8").trim();
    expect(content).toContain("[info] [logger-test] Persisted  count=1");
    expect(() => JSON.parse(content)).toThrow();
  });

  it("records exactly one timer terminal state", () => {
    const completed: { status: string; fields: Log.Fields }[] = [];
    const timer = createLogTimer(
      (status, fields) => completed.push({ status, fields }),
      { task: "import" },
    );

    timer.fail(new Error("failed"), { count: 1 });
    timer.stop({ count: 2 });
    timer[Symbol.dispose]();

    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({
      status: "failed",
      fields: {
        task: "import",
        count: 1,
        status: "failed",
        durationMillis: expect.any(Number),
        error: expect.any(Error),
      },
    });
  });
});
