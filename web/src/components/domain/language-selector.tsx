import { useTranslation } from "react-i18next"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/frame/components/ui/select"
import { usePreferences } from "@/stores/preferences"

export function LanguageSelector() {
  const { t, i18n } = useTranslation("common")
  const setLanguage = usePreferences((state) => state.setLanguage)
  return (
    <Select
      items={[{ value: "en", label: "English" }, { value: "zh-CN", label: "简体中文" }]}
      value={i18n.resolvedLanguage ?? "en"}
      onValueChange={(value) => { if (value === "en" || value === "zh-CN") setLanguage(value) }}
    >
      <SelectTrigger aria-label={t("language")}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="zh-CN">简体中文</SelectItem>
      </SelectContent>
    </Select>
  )
}
