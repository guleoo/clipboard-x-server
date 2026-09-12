import { useState, type FormEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { KeyRoundIcon } from "lucide-react"
import { Navigate, useNavigate } from "react-router"
import { useApi } from "@/api"
import { Button } from "@/frame/components/ui/button"
import { Input } from "@/frame/components/ui/input"
import { Label } from "@/frame/components/ui/label"
import { useAuth } from "@/stores"
import { messageOf } from "@/utils/format"

function AuthFrame({ title, description, children }: {
  readonly title: string
  readonly description: string
  readonly children: React.ReactNode
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-5 text-foreground">
      <section className="surface-raised w-full max-w-md p-6 sm:p-8">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <KeyRoundIcon className="size-5" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-6">{children}</div>
      </section>
    </main>
  )
}

export function LoginPage() {
  const api = useApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const authenticated = useAuth((state) => state.authenticated)
  const establish = useAuth((state) => state.establish)
  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("")
  const mutation = useMutation({
    mutationFn: () => api.login({ username, password }),
    onSuccess: async (session) => {
      establish(session.administrator)
      queryClient.setQueryData(["session"], session)
      await navigate("/", { replace: true })
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate()
  }
  if (authenticated) return <Navigate replace to="/" />
  return (
    <AuthFrame title="登录管理控制台" description="使用 config.yaml 中配置的唯一管理员账户继续。">
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1.5">
          <Label htmlFor="login-username">用户名</Label>
          <Input id="login-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-password">密码</Label>
          <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={7} required />
        </div>
        {mutation.error ? <p className="text-sm text-destructive" role="alert">{messageOf(mutation.error)}</p> : null}
        <Button className="w-full" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "正在登录…" : "登录"}
        </Button>
      </form>
    </AuthFrame>
  )
}
