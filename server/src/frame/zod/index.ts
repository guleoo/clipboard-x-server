export type * from "zod";
import { z as baseZ } from "zod";
import { dateZodExtensions, type DateZodExtensions } from "./date";

export type RegisteredZod<
  Base extends typeof baseZ,
  Extensions extends object = {},
> = Base & DateZodExtensions & Extensions;

export function register<
  Base extends typeof baseZ,
  Extensions extends object = {},
>(base: Base, extensions?: Extensions): RegisteredZod<Base, Extensions> {
  return {
    ...base,
    ...dateZodExtensions(base),
    ...extensions,
  } as RegisteredZod<Base, Extensions>;
}

export const z = register(baseZ);
export const zz = register(z);

export namespace zz {
  export type input<Schema extends baseZ.ZodType> = baseZ.input<Schema>;
  export type output<Schema extends baseZ.ZodType> = baseZ.output<Schema>;
  export type infer<Schema extends baseZ.ZodType> = baseZ.infer<Schema>;
  export type ZodType<Output = unknown> = baseZ.ZodType<Output>;
}

export function wrap<Schema extends baseZ.ZodType, Result>(
  schema: Schema,
  callback: (input: baseZ.infer<Schema>) => Result,
) {
  const wrapped = (input: baseZ.infer<Schema>): Result => callback(schema.parse(input));
  wrapped.force = (input: baseZ.infer<Schema>): Result => callback(input);
  wrapped.schema = schema;
  return wrapped;
}
