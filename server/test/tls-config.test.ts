import { describe, expect, it } from "bun:test";
import { AppOptions } from "../src/frame/config/schema";

const base = { name: "clipboard-x-server" };

describe("TLS configuration", () => {
  it("accepts the app listener fields and rejects the legacy hostname", () => {
    expect(AppOptions.parse({ host: "0.0.0.0", port: 28787, timezone: "UTC", dataDir: "../data" }))
      .toMatchObject({ host: "0.0.0.0", port: 28787, timezone: "UTC", dataDir: "../data" });
    expect(AppOptions.safeParse({ hostname: "0.0.0.0" }).success).toBe(false);
  });

  it("keeps HTTP available when TLS paths are absent", () => {
    expect(AppOptions.parse(base).tls).toBeUndefined();
    expect(AppOptions.parse({ ...base, tls: { certFile: "", keyFile: "" } }).tls)
      .toEqual({ certFile: "", keyFile: "" });
  });

  it("accepts a certificate and private key pair", () => {
    expect(AppOptions.parse({ ...base, tls: { certFile: "../tls/cert.pem", keyFile: "../tls/key.pem" } }).tls)
      .toEqual({ certFile: "../tls/cert.pem", keyFile: "../tls/key.pem" });
  });

  it("rejects an incomplete TLS pair", () => {
    expect(() => AppOptions.parse({ ...base, tls: { certFile: "../tls/cert.pem" } }))
      .toThrow("TLS certificate and private key must be configured together");
    expect(() => AppOptions.parse({ ...base, tls: { keyFile: "../tls/key.pem" } }))
      .toThrow("TLS certificate and private key must be configured together");
  });
});
