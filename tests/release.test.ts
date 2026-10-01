import { describe, expect, it } from "bun:test";
import { compileTargets, executableName, releaseName, releaseTag, releaseTarget } from "../scripts/release";

describe("release names", () => {
  it("uses the package version for local archives and preserves prerelease tags", () => {
    expect(releaseTag("0.1.0")).toBe("v0.1.0");
    expect(releaseTag("0.1.0", "v0.1.0-beta.1")).toBe("v0.1.0-beta.1");
  });

  it("rejects tags that do not match the package version", () => {
    for (const tag of ["v0.2.0", "v0.1.0beta", "v0.1.0-beta/1", "latest", "v0.1.0-", "v0.1.0+build"]) {
      expect(() => releaseTag("0.1.0", tag)).toThrow();
    }
  });

  it("names the six native targets consistently", () => {
    expect(Object.keys(compileTargets)).toHaveLength(6);
    expect(releaseTarget("linux", "x64")).toBe("linux-x64");
    expect(releaseTarget("darwin", "arm64")).toBe("macos-arm64");
    expect(releaseTarget("win32", "x64")).toBe("windows-x64");
    expect(releaseTarget("win32", "x64", "windows-arm64")).toBe("windows-arm64");
    expect(compileTargets["windows-arm64"]).toBe("bun-windows-arm64");
    expect(releaseName("v0.1.0", "windows-arm64")).toBe("clipboard-x-server-v0.1.0-windows-arm64");
    expect(executableName("windows-arm64")).toBe("clipboard-x-server.exe");
    expect(executableName("linux-x64")).toBe("clipboard-x-server");
    expect(() => releaseTarget("freebsd", "x64")).toThrow();
    expect(() => releaseTarget("linux", "ia32")).toThrow();
    expect(() => releaseTarget("linux", "x64", "freebsd-x64")).toThrow();
  });
});
