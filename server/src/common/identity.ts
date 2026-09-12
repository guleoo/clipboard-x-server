import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createId(): string {
  return crypto.randomUUID()
}

export function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && uuidV4Pattern.test(value)
}

export function createSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url")
}

export function digestSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function secretsEqual(left: string, right: string): boolean {
  const leftDigest = Buffer.from(digestSecret(left), "hex")
  const rightDigest = Buffer.from(digestSecret(right), "hex")
  return timingSafeEqual(leftDigest, rightDigest)
}
