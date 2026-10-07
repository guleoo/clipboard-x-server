import { describe, expect, it } from "bun:test";
import { archiveExtension, compileTargets, releaseName, releaseTag, type ReleaseTarget } from "./release";

describe("release tags", () => {
  it("uses the package version for local archives and preserves prerelease tags", () => {
    expect(releaseTag("0.1.0")).toBe("v0.1.0");
    expect(releaseTag("0.1.0", "v0.1.0-beta.1")).toBe("v0.1.0-beta.1");
  });

  it("rejects tags that do not match the package version", () => {
    for (const tag of ["v0.2.0", "v0.1.0beta", "v0.1.0-beta/1", "latest", "v0.1.0-", "v0.1.0+build"]) {
      expect(() => releaseTag("0.1.0", tag)).toThrow();
    }
  });
});

describe("release archives", () => {
  it("uses ZIP for both Windows architectures and tar.gz for Linux and macOS", () => {
    for (const target of Object.keys(compileTargets) as ReleaseTarget[]) {
      const extension = archiveExtension(target);
      expect(extension).toBe(target.startsWith("windows-") ? "zip" : "tar.gz");
      expect(`${releaseName("v1.0.0", target)}.${extension}`)
        .toBe(`clipboard-x-server_1.0.0_${target.replace("-", "_").replace("x64", "amd64")}.${extension}`);
    }
  });
});
