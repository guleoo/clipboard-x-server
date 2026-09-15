import { invalid } from "../common/error";

export function integerQuery(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw invalid(
      `Query parameter must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}
