import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { parse } from "yaml";
import { compileTargets } from "../scripts/release";

interface Job {
  needs?: string | string[];
  strategy?: { matrix: { include: Array<{ target: string }> } };
  steps?: Array<{ id?: string; run?: string }>;
}

const workflow = parse(readFileSync(resolve(import.meta.dir, "../.github/workflows/release.yml"), "utf8")) as {
  jobs: Record<string, Job>;
};

function dependsOn(job: string, prerequisite: string): boolean {
  const visited = new Set<string>();
  function visit(name: string): boolean {
    if (visited.has(name)) return false;
    visited.add(name);
    const needs = workflow.jobs[name]?.needs;
    const dependencies = typeof needs === "string" ? [needs] : needs ?? [];
    return dependencies.some((dependency) => dependency === prerequisite || visit(dependency));
  }
  return visit(job);
}

describe("release workflow contracts", () => {
  it("packages every supported platform exactly once", () => {
    const targets = workflow.jobs.package?.strategy?.matrix.include.map(({ target }) => target);
    expect(targets?.sort()).toEqual(Object.keys(compileTargets).sort());
  });

  it("requires verification and successful packaging before publishing", () => {
    expect(dependsOn("package", "verify")).toBe(true);
    expect(dependsOn("publish", "package")).toBe(true);
    expect(dependsOn("publish-image", "package")).toBe(true);
  });

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
