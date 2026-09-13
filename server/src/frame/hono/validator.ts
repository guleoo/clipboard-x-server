import { sValidator } from "@hono/standard-validator";
import type { Context } from "hono";
import { HttpError } from "./error";

export function validationHook(
  result: { readonly success: boolean },
  context: Context,
): Response | undefined {
  if (result.success) return;
  void context;
  throw new HttpError(400, "Request validation failed");
}

/** Validate a request target once and expose its parsed value through req.valid(). */
export const validator: typeof sValidator = ((target, schema, hook) =>
  sValidator(target, schema, async (result, context) => {
    const custom = await hook?.(result, context);
    return custom ?? validationHook(result, context as Context);
  })) as typeof sValidator;
