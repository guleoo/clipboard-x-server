import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useApi } from "@/api"
import { Button } from "@/frame/components/ui/button"
import { Input } from "@/frame/components/ui/input"
import { Label } from "@/frame/components/ui/label"
import { Page } from "@/frame/layout"
import { useAuth } from "@/stores"
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
