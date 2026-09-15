import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function findConfigRootUpward(start = process.cwd()): string | undefined {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, "config.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function resolveConfigRoot(start = process.cwd()): string | undefined {
  return findConfigRootUpward(start);
}
