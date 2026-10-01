import { i18n } from "@/frame/common/i18n"
import { usePreferences } from "@/stores/preferences"
import commonEn from "@/locales/en/common"
import errorsEn from "@/locales/en/errors"
import clipboardEn from "@/locales/en/clipboard"
import managementEn from "@/locales/en/management"
import commonZh from "@/locales/zh-CN/common"
import errorsZh from "@/locales/zh-CN/errors"
import clipboardZh from "@/locales/zh-CN/clipboard"
import managementZh from "@/locales/zh-CN/management"

export const resources = {
  en: { common: commonEn, errors: errorsEn, clipboard: clipboardEn, management: managementEn },
  "zh-CN": { common: commonZh, errors: errorsZh, clipboard: clipboardZh, management: managementZh },
}

void i18n.init({
  resources,
  lng: usePreferences.getState().language,
  supportedLngs: ["en", "zh-CN"],
  fallbackLng: "en",
  defaultNS: "common",
  initAsync: false,
  interpolation: { escapeValue: false },
})

function updateLanguage(language: string) {
  if (typeof document !== "undefined") document.documentElement.lang = language
}
i18n.on("languageChanged", updateLanguage)
updateLanguage(i18n.resolvedLanguage ?? "en")

export { i18n }
