import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useApi } from "@/api"
import { LanguageSelector } from "@/components/domain/language-selector"
import { DateTime } from "@/frame/common/date"
import { Button } from "@/frame/components/ui/button"
import { Input } from "@/frame/components/ui/input"
import { Label } from "@/frame/components/ui/label"
import { Page } from "@/frame/layout"
import { useAuth, usePreferences } from "@/stores"
import { messageOf } from "@/utils/format"

export function AccountPage() {
  const { t } = useTranslation("common")
  const api = useApi()
  const clear = useAuth((state) => state.clear)
  const queryClient = useQueryClient()
  const session = useQuery({ queryKey: ["session"], queryFn: () => api.session() })
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  useEffect(() => {
    if (session.data) setUsername(session.data.administrator.username)
  }, [session.data])
  const mutation = useMutation({
    mutationFn: () => api.updateAdministrator({ username, password }),
    onSuccess: () => {
      toast.success(t("accountSaved"))
      clear()
      queryClient.resetQueries({ queryKey: ["session"] })
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (password !== confirmation) return
    mutation.mutate()
  }
  return (
    <Page title={t("accountTitle")} description={t("accountDescription")}>
      <DisplayPreferences />
      <section className="surface-raised max-w-xl p-5 sm:p-6">
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="account-username">{t("username")}</Label>
            <Input id="account-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={64} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-password">{t("newPassword")}</Label>
            <Input id="account-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={7} maxLength={256} required />
            <p className="text-xs text-muted-foreground">{t("passwordRule")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-confirmation">{t("confirmPassword")}</Label>
            <Input id="account-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={7} maxLength={256} required />
          </div>
          {confirmation && password !== confirmation ? <p className="text-sm text-destructive" role="alert">{t("passwordMismatch")}</p> : null}
          {mutation.error ? <p className="text-sm text-destructive" role="alert">{messageOf(mutation.error)}</p> : null}
          <Button type="submit" disabled={mutation.isPending || password !== confirmation}>
            {mutation.isPending ? t("saving") : t("updateAdministrator")}
          </Button>
        </form>
      </section>
    </Page>
  )
}

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
    <section className="surface-raised mb-6 max-w-xl p-5 sm:p-6">
      <h2 className="font-semibold">{t("displayPreferences")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("displayPreferencesDescription")}</p>
      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-sm font-medium">{t("language")}</span>
        <LanguageSelector />
      </div>
      <form className="mt-4 space-y-3" onSubmit={save}>
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
