import { DateTime } from "@/frame/common/date"
import type { InterpolationMap, TFunctionReturn } from "i18next"
import { LocalizedError, type TranslationKey } from "@/frame/common/error"
import { i18n } from "@/frame/common/i18n"
import { RequestError } from "@/frame/request"
import errors from "@/locales/en/errors"
import { usePreferences } from "@/stores/preferences"

export function formatDate(value: number): string {
  return value > 0 ? DateTime.format(value, {
    locale: i18n.resolvedLanguage ?? "en",
    offsetMinutes: usePreferences.getState().offsetMinutes,
  }) : i18n.t("never")
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  const units = ["KiB", "MiB", "GiB"]
  let size = value / 1024
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`
}

export function formatProgress(completed: number, total: number): string {
  return total > 0 ? `${Math.round((completed / total) * 100)}%` : "—"
}

export function errorMessage(code: string): string {
  return Object.hasOwn(errors, code)
    ? i18n.t(`errors:${code as keyof typeof errors}`)
    : i18n.t("request.business")
}

export function messageOf(error: unknown, context?: "login"): string {
  if (error instanceof LocalizedError) {
    const { fieldKey, ...values } = error.params
    const params: Record<string, string | number> = { ...values }
    if (typeof fieldKey === "string") params.field = i18n.t(fieldKey as TranslationKey)
    return i18n.t(error.key, params as InterpolationMap<TFunctionReturn<"common", TranslationKey, {}>>)
  }
  if (error instanceof RequestError) {
    if (context === "login" && error.code === "not_authenticated") return i18n.t("loginFailed")
    if (error.code) return errorMessage(error.code)
    return i18n.t(`request.${error.category}`, { status: error.status ?? 0 })
  }
  return i18n.t("unknownError")
}
