import { sValidator } from "@hono/standard-validator";
import type { Context } from "hono";
import { Result } from "../core";

export function validationHook(
  result: { readonly success: boolean },
  context: Context,
): Response | undefined {
  if (result.success) return;
  return context.json(Result.fail(400, "Invalid request"), 400);
}

/** Validate a request target once and expose its parsed value through req.valid(). */
export const validator: typeof sValidator = ((target, schema, hook) =>
  sValidator(target, schema, async (result, context) => {
    const custom = await hook?.(result, context);
    return custom ?? validationHook(result, context as Context);
  })) as typeof sValidator;
