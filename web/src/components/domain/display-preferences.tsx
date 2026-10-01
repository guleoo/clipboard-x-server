import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { LanguageSelector } from "./language-selector"
import { DateTime } from "@/frame/common/date"
import { Input } from "@/frame/components/ui/input"
import { Label } from "@/frame/components/ui/label"
import { usePreferences } from "@/stores/preferences"

function offsetText(minutes: number): string {
  const absolute = Math.abs(minutes)
  return `${minutes < 0 ? "-" : ""}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`
}

function offsetOf(text: string): number | null {
  const match = /^([+-]?)(\d{2}):([0-5]\d)$/.exec(text)
  if (!match) return null
  const minutes = (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "-" ? -1 : 1)
  return minutes >= -720 && minutes <= 840 && minutes % 15 === 0 ? minutes : null
}

export function DisplayPreferences() {
  const { t } = useTranslation("common")
  const offsetMinutes = usePreferences((state) => state.offsetMinutes)
  const setOffset = usePreferences((state) => state.setOffset)
  const [offset, setOffsetText] = useState(() => offsetText(offsetMinutes))
  const [invalid, setInvalid] = useState(false)
  useEffect(() => {
    setOffsetText(offsetText(offsetMinutes))
    setInvalid(false)
  }, [offsetMinutes])
  function change(text: string) {
    setOffsetText(text)
    setInvalid(false)
    const minutes = offsetOf(text)
    if (minutes !== null) setOffset(minutes)
  }
  return (
    <section className="surface-raised mb-6 max-w-4xl p-5 sm:p-6">
      <h2 className="font-semibold">{t("language")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("displayPreferencesDescription")}</p>
      <div className="mt-4 flex max-w-sm items-center justify-between gap-4">
        <span className="text-sm font-medium">{t("language")}</span>
        <LanguageSelector />
      </div>
      <div className="mt-4 max-w-sm space-y-3">
        <Label htmlFor="display-offset">{t("utcOffset")}</Label>
        <Input id="display-offset" type="text" placeholder="08:00" value={offset}
          onChange={(event) => change(event.target.value)}
          onBlur={() => setInvalid(offsetOf(offset) === null)}
          aria-invalid={invalid} aria-describedby={invalid ? "display-offset-description display-offset-error" : "display-offset-description"} />
        <p id="display-offset-description" className="text-xs leading-relaxed text-muted-foreground">{t("utcOffsetDescription")}</p>
        <p className="text-xs text-muted-foreground">{t("currentTimezone", { offset: DateTime.offsetLabel(offsetMinutes) })}</p>
        {invalid ? <p id="display-offset-error" role="alert" className="text-sm text-destructive">{t("utcOffsetInvalid")}</p> : null}
      </div>
    </section>
  )
}
