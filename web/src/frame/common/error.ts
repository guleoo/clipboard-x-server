import type { ParseKeys, TypeOptions } from "i18next"

export type TranslationKey = {
  [Name in keyof TypeOptions["resources"]]: `${Name & string}:${ParseKeys<Name> & string}`
}[keyof TypeOptions["resources"]]

export class LocalizedError extends Error {
  readonly name = "LocalizedError"

  constructor(
    public readonly key: TranslationKey,
    public readonly params: Readonly<Record<string, string | number>> = {},
    options?: ErrorOptions,
  ) {
    super(key, options)
  }
}

export function errorOf(value: unknown): Error {
  return value instanceof Error ? value : new LocalizedError("common:unknownError", {}, { cause: value })
}
