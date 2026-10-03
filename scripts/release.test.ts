import { describe, expect, it } from "bun:test";
import { releaseTag } from "./release";

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
