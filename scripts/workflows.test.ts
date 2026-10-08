import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

describe("release notes", () => {
  it.each(["v1.2.3", "v1.2.3-beta.1"])("publishes the prepared English document for %s", (tag) => {
    const script = workflow.jobs.publish?.steps?.find((step) => step.id === "release")?.run;
    expect(script).toBeDefined();
    const directory = mkdtempSync(resolve(tmpdir(), "clipboard-x-release-notes-"));
    const notes = resolve(directory, "docs/release");
    const english = "## Features\n\nPrepared English release notes.\n";
    try {
      mkdirSync(notes, { recursive: true });
      writeFileSync(resolve(notes, `${tag}-en.md`), english);
      writeFileSync(resolve(notes, `${tag}-cn.md`), "中文发布说明\n");
      mkdirSync(resolve(directory, "release"));
      const assets = ["linux_amd64", "linux_arm64", "macos_amd64", "macos_arm64", "windows_amd64", "windows_arm64"]
        .map((target) => `release/clipboard-x-server_${tag.slice(1)}_${target}.${target.startsWith("windows_") ? "zip" : "tar.gz"}`);
      assets.push("release/SHA256SUMS");
      for (const asset of assets) writeFileSync(resolve(directory, asset), "Release asset\n");
      // Capture the publish command without contacting GitHub or creating a Release.
      const stub = `gh() {
        printf '%s\\n' "$@"
        while [[ $# -gt 0 ]]; do
          if [[ "$1" == "--notes-file" ]]; then
            cat "$2"
            return
          fi
          shift
        done
        return 1
      }`;
      const result = spawnSync("bash", ["-euo", "pipefail", "-c", `${stub}\n${script!}`], {
        cwd: directory,
        env: { ...process.env, GITHUB_REF_NAME: tag },
        encoding: "utf8",
      });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(result.stderr);
      const arguments_ = result.stdout.split(/\r?\n/u);
      expect(arguments_.slice(0, 3)).toEqual(["release", "create", tag]);
      expect(arguments_.slice(3, 3 + assets.length).sort()).toEqual([...assets].sort());
      expect(arguments_[arguments_.indexOf("--notes-file") + 1]).toBe(`docs/release/${tag}-en.md`);
      expect(arguments_).not.toContain("--generate-notes");
      expect(arguments_.includes("--prerelease")).toBe(tag.includes("-"));
      expect(arguments_.includes("--latest=false")).toBe(tag.includes("-"));
      expect(result.stdout.endsWith(english)).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("requires both language documents before building a tagged release", () => {
    const script = workflow.jobs.verify?.steps?.find((step) => step.id === "release-notes")?.run;
    expect(script).toBeDefined();
    const directory = mkdtempSync(resolve(tmpdir(), "clipboard-x-release-notes-"));
    const notes = resolve(directory, "docs/release");
    const tag = "v1.2.3";
    const run = () => spawnSync("bash", ["-euo", "pipefail", "-c", script!], {
      cwd: directory,
      env: { ...process.env, GITHUB_REF_NAME: tag },
      encoding: "utf8",
    });
    try {
      mkdirSync(notes, { recursive: true });
      writeFileSync(resolve(notes, `${tag}-en.md`), "English\n");
      writeFileSync(resolve(notes, `${tag}-cn.md`), "中文\n");
      expect(run().status).toBe(0);
      for (const language of ["en", "cn"]) {
        const path = resolve(notes, `${tag}-${language}.md`);
        rmSync(path);
        expect(run().status).not.toBe(0);
        writeFileSync(path, "Release notes\n");
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
