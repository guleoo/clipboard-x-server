import { z } from "zod";

export interface ResultBody<T = unknown> {
  readonly code: number;
  readonly msg: string;
  readonly result?: T;
}

export interface Page<T> {
  readonly list: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export function resultSchema<T extends z.ZodType>(schema: T) {
  return z.object({
    code: z.number().int(),
    msg: z.string(),
    result: schema.optional(),
  });
}

export function successResultSchema<T extends z.ZodType>(schema: T) {
  return z.object({
    code: z.literal(200),
    msg: z.string(),
    result: schema,
  });
}

export function pageSchema<T extends z.ZodType>(schema: T) {
  return z.object({
    list: z.array(schema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });
}

export namespace Result {
  export function data<T>(result: T): ResultBody<T> {
    return { code: 200, msg: "ok", result };
  }

  export function page<T>(result: Page<T>): ResultBody<Page<T>> {
    return data(result);
  }

  export function ok(msg = "ok"): ResultBody {
    return { code: 200, msg, result: undefined };
  }

  export function fail(code: number, msg: string): ResultBody {
    return { code, msg, result: undefined };
  }
}
