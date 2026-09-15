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

const DEFAULT_PAGE_SIZE = 10;

export const PageReqSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .default(DEFAULT_PAGE_SIZE)
    .optional(),
});

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

export function pageRespSchema<T extends z.ZodType>(schema: T) {
  return z.object({
    list: z.array(schema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });
}

export const pageSchema = pageRespSchema;
export const PageRespSchema = pageRespSchema(z.any());
export type PageResp<T = unknown> = Page<T>;

export namespace Result {
  export function custom<T>(body: ResultBody<T>): ResultBody<T> {
    return body;
  }

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
