import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { LanguageSelector } from "./language-selector"
import { DateTime } from "@/frame/common/date"
import { Button } from "@/frame/components/ui/button"
import { Input } from "@/frame/components/ui/input"
import { Label } from "@/frame/components/ui/label"
import { usePreferences } from "@/stores/preferences"

export function DisplayPreferences() {
  const { t } = useTranslation("common")
  const offsetMinutes = usePreferences((state) => state.offsetMinutes)
  const setOffset = usePreferences((state) => state.setOffset)
  const [hours, setHours] = useState(String(offsetMinutes / 60))
  const [invalid, setInvalid] = useState(false)
  useEffect(() => setHours(String(offsetMinutes / 60)), [offsetMinutes])
  function save(event: FormEvent) {
    event.preventDefault()
    const minutes = Number(hours) * 60
    if (!hours.trim() || !Number.isInteger(minutes) || minutes < -720 || minutes > 840 || minutes % 15 !== 0) {
      setInvalid(true)
      return
    }
    setOffset(minutes)
    setInvalid(false)
    toast.success(t("preferencesSaved"))
  }
  return (
    <section className="surface-raised mb-6 max-w-4xl p-5 sm:p-6">
      <h2 className="font-semibold">{t("displayPreferences")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("displayPreferencesDescription")}</p>
      <div className="mt-4 flex max-w-sm items-center justify-between gap-4">
        <span className="text-sm font-medium">{t("language")}</span>
        <LanguageSelector />
      </div>
      <form className="mt-4 max-w-sm space-y-3" onSubmit={save}>
        <Label htmlFor="display-offset">{t("utcOffset")}</Label>
        <Input id="display-offset" type="number" min={-12} max={14} step={0.25} value={hours}
          onChange={(event) => { setHours(event.target.value); setInvalid(false) }} required
          aria-invalid={invalid} aria-describedby="display-offset-description" />
        <p id="display-offset-description" className="text-xs leading-relaxed text-muted-foreground">{t("utcOffsetDescription")}</p>
        <p className="text-xs text-muted-foreground">{t("currentTimezone", { offset: DateTime.offsetLabel(offsetMinutes) })}</p>
        {invalid ? <p role="alert" className="text-sm text-destructive">{t("utcOffsetInvalid")}</p> : null}
        <Button type="submit" variant="outline">{t("savePreferences")}</Button>
      </form>
    </section>
  )
}
