import type { Context } from "hono"
import type { z } from "zod"
import { invalid } from "../common/error"

export async function json<Schema extends z.ZodType>(c: Context, schema: Schema): Promise<z.output<Schema>> {
  let input: unknown
  try {
    input = await c.req.json()
  } catch (cause) {
    throw invalid("Request body must be valid JSON", { cause: cause instanceof SyntaxError ? "syntax" : "read" })
  }
  return schema.parse(input)
}

export function integerQuery(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw invalid(`Query parameter must be an integer between ${minimum} and ${maximum}`)
  }
  return parsed
}
