import { describe, expect, it } from "bun:test";
import { ManagedConfigurationSchema, config } from "../../src/config";

describe("administrator configuration", () => {
  it("accepts arbitrary passwords longer than six characters", () => {
    const base = { ...config.read(), administrator: { username: "admin", password: "1234567" } };
    expect(ManagedConfigurationSchema.parse(base).administrator.password).toBe("1234567");
    expect(() => ManagedConfigurationSchema.parse({
      ...base,
      administrator: { username: "admin", password: "123456" },
    })).toThrow();
  });
});
