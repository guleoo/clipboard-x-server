import { z } from "zod"

export const UuidSchema = z.uuidv4()
export const ContentIdSchema = z.string().min(1).max(128).refine((value) => !/[\r\n\0]/u.test(value))
export const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u)
export const MimeTypeSchema = z.string().max(255).regex(
  /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[^\r\n]{1,128})?$/iu,
)
export const SafeTextSchema = (maximum: number) => z.string().max(maximum).refine((value) => !/[\r\n\0]/u.test(value))
export const DeviceIconSchema = z.enum(["desktop", "laptop", "phone", "tablet", "server", "other"])

export function parseInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || value === "") return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Expected integer between ${minimum} and ${maximum}`)
  }
  return parsed
}
