import { describe, expect, it } from "bun:test";
import { config } from "../../src/config";
import { db } from "../../src/db";
import { sqliteValue } from "../../src/common/sqlite";

describe("product database runtime", () => {
  it("exposes one process-wide configuration and database facade", async () => {
    const [{ config: secondConfig }, { db: secondDb }] = await Promise.all([
      import("../../src/config"),
      import("../../src/db"),
    ]);
    expect(secondConfig).toBe(config);
    expect(secondDb).toBe(db);
  });

  it("normalizes safe SQLite integers at raw-query boundaries", () => {
    expect(sqliteValue({ count: 2n, nested: [3n] })).toEqual({
      count: 2,
      nested: [3],
    });
    expect(() => sqliteValue(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(
      RangeError,
    );
  });
});
