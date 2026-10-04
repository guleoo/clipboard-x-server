import { describe, expect, it } from "bun:test";
import { PageReqSchema } from "../../src/frame/core";
import { register, zz } from "../../src/frame/zod";
describe("schema extensions and pagination", () => {
  it("retains governed extension and pagination entry points", () => {
    const extended = register(zz, {
      identifier: () => zz.string().trim().min(1),
    });
    expect(extended.identifier().parse(" account-1 ")).toBe("account-1");
    expect(PageReqSchema.parse({ page: "2", pageSize: "20" })).toEqual({
      page: 2,
      pageSize: 20,
    });
    expect(PageReqSchema.parse({})).toEqual({ page: 1, pageSize: 10 });
  });
});
