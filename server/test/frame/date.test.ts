import { describe, expect, it } from "bun:test";
import "../../src/frame/config";
import { DateFormat, DateParser, PlainDate, Zone, withZone } from "../../src/frame/core";
import { zz } from "../../src/frame/zod";

describe("date protocol", () => {
  it("keeps plain dates and zoned exchange values distinct", () => {
    const date = DateParser.pdate("2026-09-11");
    expect(date).toBeInstanceOf(PlainDate);
    expect(DateFormat.pdate(date)).toBe("2026-09-11");
    expect(DateFormat.utc(withZone(date, Zone.UTC))).toStartWith(
      "2026-09-11T00:00:00+00:00",
    );
    expect(JSON.stringify(date)).toBe(JSON.stringify(DateFormat.trans(date)));
  });

  it("provides registered Zod date preprocessors", () => {
    expect(zz.pdate().parse("2026-09-11")).toBeInstanceOf(PlainDate);
    expect(zz.zdatetime().safeParse("2026-09-11").success).toBe(false);
  });
});
