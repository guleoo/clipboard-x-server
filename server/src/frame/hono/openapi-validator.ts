import { validator as honoOpenApiValidator } from "hono-openapi";
import type { Context } from "hono";
import { validationHook } from "./validator";

/** OpenAPI-aware request validation with the same governed failure envelope. */
export const openApiValidator: typeof honoOpenApiValidator = ((
  target,
  schema,
  hook,
  options,
) =>
  honoOpenApiValidator(
    target,
    schema,
    async (result, context) => {
      const custom = await hook?.(result, context);
      return custom ?? validationHook(result, context as Context);
    },
    options,
  )) as typeof honoOpenApiValidator;
