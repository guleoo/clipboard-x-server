import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const platformNames: Readonly<Record<string, string>> = {
  darwin: "macos",
  linux: "linux",
  win32: "windows",
};

export const compileTargets = {
  "linux-x64": "bun-linux-x64",
  "linux-arm64": "bun-linux-arm64",
  "macos-x64": "bun-darwin-x64",
  "macos-arm64": "bun-darwin-arm64",
  "windows-x64": "bun-windows-x64",
  "windows-arm64": "bun-windows-arm64",
} as const;

export type ReleaseTarget = keyof typeof compileTargets;
const tagPattern = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;

export function releaseTag(version: string, requestedTag?: string): string {
  const tag = requestedTag || `v${version}`;
  if (!tagPattern.test(tag) || (tag !== `v${version}` && !tag.startsWith(`v${version}-`))) {
    throw new Error(`Release tag ${JSON.stringify(tag)} must match package version ${version}`);
  }
  return tag;
}

export function releaseTarget(platform: string, architecture: string, requestedTarget?: string): ReleaseTarget {
  const platformName = platformNames[platform];
  const nativeTarget = `${platformName}-${architecture}`;
  const target = requestedTarget || nativeTarget;
  if (!(target in compileTargets)) {
    throw new Error(`Unsupported release target: ${platform}/${architecture}`);
  }
  return target as ReleaseTarget;
}

export function releaseName(tag: string, target: ReleaseTarget): string {
  return `clipboard-x-server-${tag}-${target}`;
}

export function executableName(target: ReleaseTarget): string {
  return target.startsWith("windows-") ? "clipboard-x-server.exe" : "clipboard-x-server";
}

if (import.meta.main) {
  const packageJson = JSON.parse(readFileSync(resolve(import.meta.dir, "../package.json"), "utf8")) as { version: string };
  console.log(releaseTag(packageJson.version, process.env.CBX_RELEASE_TAG));
}
