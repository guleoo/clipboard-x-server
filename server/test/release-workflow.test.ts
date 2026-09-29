import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const root = resolve(import.meta.dir, "../..");
const workflow = parse(readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8")) as {
  on: { push: { tags: string[] }; workflow_dispatch: unknown };
  env: { CBX_RELEASE_TAG: string };
  jobs: {
    verify: { steps: Array<{ run?: string; uses?: string }> };
    package: {
      needs: string;
      strategy: { matrix: { include: Array<{ runner: string; target: string }> } };
      steps: Array<{ run?: string; uses?: string; with?: Record<string, unknown> }>;
    };
    publish: {
      if: string;
      needs: string;
      permissions: { contents: string };
      steps: Array<{ run?: string; uses?: string; with?: Record<string, unknown> }>;
    };
    "publish-image": {
      if: string;
      needs: string;
      permissions: { contents: string; packages: string };
      steps: Array<{ id?: string; run?: string; uses?: string; with?: Record<string, unknown> }>;
    };
  };
};

describe("GitHub Release workflow", () => {
  it("uses Node 24 checkout in every job", () => {
    for (const job of [workflow.jobs.verify, workflow.jobs.package, workflow.jobs.publish, workflow.jobs["publish-image"]]) {
      expect(job.steps.find((step) => step.uses?.startsWith("actions/checkout@"))?.uses).toBe("actions/checkout@v5");
    }
  });

  it("supports a build-only manual run and checks tags against the package version", () => {
    expect(workflow.on.push.tags).toEqual(["v*"]);
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.env.CBX_RELEASE_TAG).toContain("github.ref_type == 'tag'");
    expect(workflow.jobs.verify.steps.some((step) => step.run === "bun scripts/release.ts")).toBe(true);
    expect(workflow.jobs.publish.if).toContain("github.event_name == 'push'");
  });

  it("builds and smoke-tests exactly the six native targets", () => {
    const targets = workflow.jobs.package.strategy.matrix.include;
    expect(targets).toEqual([
      { runner: "ubuntu-24.04", target: "linux-x64" },
      { runner: "ubuntu-24.04-arm", target: "linux-arm64" },
      { runner: "macos-15-intel", target: "macos-x64" },
      { runner: "macos-15", target: "macos-arm64" },
      { runner: "windows-2025", target: "windows-x64" },
      { runner: "windows-11-arm", target: "windows-arm64" },
    ]);
    expect(workflow.jobs.package.needs).toBe("verify");
    expect(workflow.jobs.package.steps.some((step) => step.run === "bun run package")).toBe(true);
    expect(workflow.jobs.package.steps.some((step) => step.run === "bun scripts/smoke-release.ts")).toBe(true);
    expect(workflow.jobs.package.steps.find((step) => step.uses === "actions/upload-artifact@v4")?.with?.["if-no-files-found"]).toBe("error");
  });

  it("publishes only after all packages pass, with checksums and restricted write access", () => {
    const publish = workflow.jobs.publish;
    expect(publish.needs).toBe("package");
    expect(publish.permissions.contents).toBe("write");
    expect(publish.steps[0]?.uses).toBe("actions/checkout@v5");
    expect(publish.steps.find((step) => step.uses === "actions/download-artifact@v4")?.with?.["merge-multiple"]).toBe(true);
    expect(publish.steps.some((step) => step.run?.includes("tar -tzf") && step.run.includes("SHA256SUMS"))).toBe(true);
    expect(publish.steps.some((step) => step.run?.includes("gh release create") && step.run.includes("--prerelease"))).toBe(true);
  });

  it("publishes versioned multi-platform GHCR images and reserves latest for stable tags", () => {
    const image = workflow.jobs["publish-image"];
    expect(image.if).toContain("github.event_name == 'push'");
    expect(image.needs).toBe("package");
    expect(image.permissions).toEqual({ contents: "read", packages: "write" });
    expect(image.steps.some((step) => step.uses === "docker/setup-qemu-action@v4")).toBe(true);
    expect(image.steps.some((step) => step.uses === "docker/setup-buildx-action@v4")).toBe(true);
    expect(image.steps.find((step) => step.uses === "docker/login-action@v4")?.with?.registry).toBe("ghcr.io");
    const tags = image.steps.find((step) => step.id === "image-tags")?.run;
    expect(tags).toContain("ghcr.io/guleoo/clipboard-x-server:${GITHUB_REF_NAME}");
    expect(tags).toContain('if [[ "$GITHUB_REF_NAME" != *-* ]]');
    expect(tags).toContain("ghcr.io/guleoo/clipboard-x-server:latest");
    const build = image.steps.find((step) => step.uses === "docker/build-push-action@v7");
    expect(build?.with?.platforms).toBe("linux/amd64,linux/arm64");
    expect(build?.with?.push).toBe(true);
  });
});
