import { validator as honoOpenApiValidator } from "hono-openapi";
import { invalid } from "../common/error";

/** OpenAPI-aware validation adapted to Clipboard X's public error envelope. */
export const validator: typeof honoOpenApiValidator = ((
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
      if (custom) return custom;
      if (!result.success) throw invalid("Invalid request");
    },
    options,
  )) as typeof honoOpenApiValidator;
