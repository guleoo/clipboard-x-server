import { createId } from "@paralleldrive/cuid2";
import { customAlphabet } from "nanoid";

export { createId };

const HUMAN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const DEFAULT_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const DEFAULT_LENGTH = 8;

export interface ShortIdOptions {
  readonly length?: number;
  readonly alphabet?: string;
  readonly prefix?: string;
}

function prefix(value?: string): string {
  return value ? `${value}_` : "";
}

export function createUUID(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("crypto.randomUUID is not available in this runtime");
  }
  return globalThis.crypto.randomUUID();
}

export function createShortId(length?: number): string;
export function createShortId(options?: ShortIdOptions): string;
export function createShortId(input?: number | ShortIdOptions): string {
  const options = typeof input === "number" ? { length: input } : (input ?? {});
  const length = options.length ?? DEFAULT_LENGTH;
  return `${prefix(options.prefix)}${customAlphabet(options.alphabet ?? DEFAULT_ALPHABET, length)()}`;
}

export function createHumanCode(length = DEFAULT_LENGTH): string {
  return customAlphabet(HUMAN_ALPHABET, length)();
}

export function createVerifyCode(length = 6): string {
  return customAlphabet(DIGITS, length)();
}
