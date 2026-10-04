import { describe, expect, it } from "bun:test";
import { operationResponseSchemas } from "../../src/dto/response";

describe("device response contracts", () => {
  it("separates client-owned profiles from administrator device controls", () => {
    const device = {
      id: "123e4567-e89b-42d3-a456-426614174000",
      tag: "Workstation",
      iconKind: "desktop",
      iconColor: { light: "#ffffff" },
      state: "offline",
      lastSeenAt: 0,
      createdAt: 1,
      updatedAt: 1,
      kind: "client",
    };

    expect(operationResponseSchemas.updateDeviceProfile.safeParse(device).success).toBe(true);
    expect(operationResponseSchemas.createDevice.safeParse({ ...device, keys: [] }).success).toBe(true);
    expect(operationResponseSchemas.updateDevice.safeParse({ ...device, keys: [] }).success).toBe(true);
    expect(operationResponseSchemas.updateDevice.safeParse(device).success).toBe(false);
  });
});
