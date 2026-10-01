import { beforeEach, describe, expect, test } from "bun:test";
import { i18n } from "../../src/i18n";
import { RequestError } from "../../src/frame/request";
import { formatBytes, formatProgress, messageOf } from "../../src/utils/format";

beforeEach(async () => { await i18n.changeLanguage("en") })

describe("web formatting", () => {
  test("formats byte and progress values for the console", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(1536)).toBe("1.5 KiB")
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MiB")
    expect(formatProgress(1, 4)).toBe("25%")
    expect(formatProgress(0, 0)).toBe("—")
  })

  test("formats stable request errors without relying on transport types", () => {
    const error = new RequestError("business", "拒绝访问", 403, "not_authorized", "request-1")
    expect(error).toMatchObject({ code: "not_authorized", status: 403, requestId: "request-1" })
    expect(messageOf(error)).toBe("You do not have permission to perform this action.")
  })
})
