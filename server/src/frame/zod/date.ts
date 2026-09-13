import type { z as Zod } from "zod";
import {
  DateParser,
  PlainDate,
  PlainDateTime,
  PlainTime,
  ZonedDateTime,
} from "../core/date";

function parseOrKeep<Value>(
  input: unknown,
  Type: { new (...args: never[]): Value },
  parse: (value: string) => Value,
): Value | unknown {
  if (input instanceof Type) return input;
  if (typeof input !== "string") return input;
  try {
    return parse(input);
  } catch {
    return input;
  }
}

export interface DateZodExtensions {
  pdate(): ReturnType<typeof Zod.preprocess>;
  pdatetime(): ReturnType<typeof Zod.preprocess>;
  ptime(): ReturnType<typeof Zod.preprocess>;
  zdatetime(): ReturnType<typeof Zod.preprocess>;
}

type ExtensionBase = Pick<typeof Zod, "preprocess" | "instanceof">;

export function dateZodExtensions<Base extends ExtensionBase>(
  zod: Base,
): DateZodExtensions {
  return {
    pdate: () =>
      zod.preprocess(
        (input) => parseOrKeep(input, PlainDate, DateParser.pdate),
        zod.instanceof(PlainDate, { message: "Expected yyyy-MM-dd" }),
      ),
    pdatetime: () =>
      zod.preprocess(
        (input) => parseOrKeep(input, PlainDateTime, DateParser.pdatetime),
        zod.instanceof(PlainDateTime, { message: "Expected a plain date-time" }),
      ),
    ptime: () =>
      zod.preprocess(
        (input) => parseOrKeep(input, PlainTime, DateParser.ptime),
        zod.instanceof(PlainTime, { message: "Expected HH:mm:ss" }),
      ),
    zdatetime: () =>
      zod.preprocess(
        (input) => parseOrKeep(input, ZonedDateTime, DateParser.zone),
        zod.instanceof(ZonedDateTime, { message: "Expected an ISO date-time with a zone or offset" }),
      ),
  };
}
