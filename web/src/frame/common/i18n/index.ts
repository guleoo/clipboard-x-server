import { createInstance, type i18n as Instance } from "i18next"
import { initReactI18next } from "react-i18next"

export const i18n: Instance = createInstance().use(initReactI18next)
