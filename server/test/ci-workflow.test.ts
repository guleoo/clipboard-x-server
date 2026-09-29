import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const root = resolve(import.meta.dir, "../..");
const workflow = parse(readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8")) as {
  jobs: { verify: { steps: Array<{ run?: string; uses?: string }> } };
};

describe("CI workflow", () => {
  it("uses the workspace test command and Node 24 checkout", () => {
    const steps = workflow.jobs.verify.steps;
    expect(steps.some((step) => step.run === "bun run test")).toBe(true);
    expect(steps.some((step) => step.run === "bun test")).toBe(false);
    expect(steps[0]?.uses).toBe("actions/checkout@v5");
  });
});
