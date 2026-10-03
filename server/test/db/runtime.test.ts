import { describe, expect, it } from "bun:test";
import { sqliteValue } from "../../src/common/sqlite";

describe("product database runtime", () => {
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
