import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { CleanupOptions, config } from "../../src/config";

describe("cleanup configuration", () => {
  it("enables cleanup with a 1000-item device-in-channel limit and 30-day retention by default", () => {
    const defaults = {
      enabled: true,
      intervalMillis: 3_600_000,
      clipboard: { maxItemsPerDevicePerChannel: 1000, maxAgeMillis: 2_592_000_000 },
    };
    expect(CleanupOptions.parse(undefined)).toEqual(defaults);
    expect(CleanupOptions.parse({})).toEqual(defaults);
    expect(config.cleanup).toEqual(defaults);
    expect(CleanupOptions.parse({ enabled: false, clipboard: {} })).toEqual({
      enabled: false, intervalMillis: 3_600_000, clipboard: {},
    });
    const parsed = CleanupOptions.parse({
      enabled: true,
      intervalMillis: 60_000,
      clipboard: {
        maxItems: 100,
        maxItemsPerDevice: 10,
        maxItemsPerChannel: 20,
        maxItemsPerDevicePerChannel: 5,
        maxAgeMillis: 60_000,
      },
    });
    expect(parsed.enabled).toBe(true);
    expect(parsed.intervalMillis).toBe(60_000);
    expect(parsed.clipboard.maxItemsPerDevicePerChannel).toBe(5);
    expect(() => CleanupOptions.parse({ clipboard: { maxItemsPerDevice: 0 } })).toThrow();
    expect(() => CleanupOptions.parse({ intervalMillis: 100 })).toThrow();
  });

  it("writes cleanup configuration to formatted YAML and updates the active policy", () => {
    const original = config.cleanup;
    const before = readFileSync(config.path, "utf8");
    try {
      expect(() => config.updateCleanup({ clipboard: { maxItemsPerChannel: 0 } })).toThrow();
      expect(readFileSync(config.path, "utf8")).toBe(before);
      const saved = config.updateCleanup({
        enabled: true,
        intervalMillis: 61_250,
        clipboard: { maxItemsPerDevice: 12, maxAgeMillis: 86_400_125 },
      });
      expect(saved).toEqual(CleanupOptions.parse({
        enabled: true,
        intervalMillis: 61_250,
        clipboard: { maxItemsPerDevice: 12, maxAgeMillis: 86_400_125 },
      }));
      expect(config.cleanup).toEqual(saved);
      const yaml = readFileSync(config.path, "utf8");
      expect(yaml).toContain("cleanup:\n");
      expect(yaml).toContain("max-items-per-device: 12\n");
      expect(yaml).toContain("interval: 61.25\n");
      expect(yaml).toContain("max-age: 86400.125\n");
      expect(() => config.updateCleanup({ clipboard: { maxItemsPerDevice: -1 } })).toThrow();
      expect(readFileSync(config.path, "utf8")).toBe(yaml);
    } finally {
      config.updateCleanup(original);
    }
  });
});
