import { describe, expect, test } from "bun:test";
import { formatBytes, formatProgress } from "../../src/utils/format";

describe("web formatting", () => {
  test("formats byte and progress values for the console", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(1536)).toBe("1.5 KiB")
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MiB")
    expect(formatProgress(1, 4)).toBe("25%")
    expect(formatProgress(0, 0)).toBe("—")
  })
})
