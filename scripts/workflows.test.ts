import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parse } from "yaml";

interface Job {
  steps?: Array<{ id?: string; run?: string }>;
}

const workflow = parse(readFileSync(resolve(import.meta.dir, "../.github/workflows/release.yml"), "utf8")) as {
  jobs: Record<string, Job>;
};

describe("release image tags", () => {
  it.each([false, true])("updates latest only for stable image tags (prerelease: %s)", (prerelease) => {
    const script = workflow.jobs["publish-image"]?.steps?.find((step) => step.id === "image-tags")?.run;
    expect(script).toBeDefined();
    const { version } = JSON.parse(readFileSync(resolve(import.meta.dir, "../package.json"), "utf8"));
    const tag = `v${version}${prerelease ? "-beta.1" : ""}`;
    const directory = mkdtempSync(resolve(tmpdir(), "clipboard-x-image-tags-"));
    const output = resolve(directory, "output");
    try {
      const result = spawnSync("bash", ["-euo", "pipefail", "-c", script!], {
        env: { ...process.env, GITHUB_REF_NAME: tag, GITHUB_OUTPUT: output },
        encoding: "utf8",
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(result.stderr);
      const tags = readFileSync(output, "utf8").split(/\r?\n/u)
        .filter((line) => line.startsWith("ghcr.io/"));
      expect(tags).toContain(`ghcr.io/guleoo/clipboard-x-server:${tag}`);
      expect(tags.some((value) => value.endsWith(":latest"))).toBe(!prerelease);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
