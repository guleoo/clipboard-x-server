import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CableIcon, ClipboardListIcon, LayoutDashboardIcon, LogOutIcon, MoonIcon, NetworkIcon, SettingsIcon, SunIcon } from "lucide-react"
import { Navigate, NavLink, useLocation, useNavigate } from "react-router"
import { useApi } from "@/api"
import { ErrorState, LoadingState } from "@/components/domain/states"
import { Button } from "@/frame/components/ui/button"
import { Layout } from "@/frame/layout/normal"
import { RequestError } from "@/frame/request"
import { useRouter } from "@/frame/router"
import { useAuth, useTabs, useTheme } from "@/stores"

const icons = {
  "app.dashboard": LayoutDashboardIcon,
  "app.devices": CableIcon,
  "app.channels": NetworkIcon,
  "app.clipboard": ClipboardListIcon,
  "app.transfers": CableIcon,
  "app.account": SettingsIcon,
} as const

function Navigation() {
  const { menus } = useRouter()
  return <nav aria-label="主导航" className="space-y-1">{menus.filter((item) => item.path).map((item) => {
    const Icon = icons[item.id as keyof typeof icons]
    return <NavLink key={item.id} to={item.path!} end={item.path === "/"} aria-disabled={item.disabled} className={({ isActive }) => ["flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors", isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"].join(" ")}>{Icon ? <Icon className="size-4" aria-hidden="true" /> : null}{item.title}</NavLink>
  })}</nav>
}

function SessionGate() {
  const api = useApi()
  const establish = useAuth((state) => state.establish)
  const clear = useAuth((state) => state.clear)
  const query = useQuery({ queryKey: ["session"], queryFn: api.session, retry: false })
  useEffect(() => {
    if (query.data) establish(query.data.administrator)
    else if (query.error instanceof RequestError && query.error.status === 401) clear()
  }, [clear, establish, query.data, query.error])
  if (query.isPending) return <LoadingState label="正在验证会话" />
  if (query.error instanceof RequestError && query.error.status === 401) return <Navigate replace to="/login" />
  if (query.error) return <main className="p-6"><ErrorState error={query.error} retry={() => query.refetch()} /></main>
  return <AuthenticatedLayout />
}

function AuthenticatedLayout() {
  const api = useApi()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { menus } = useRouter()
  const visit = useTabs((state) => state.visit)
  const clear = useAuth((state) => state.clear)
  const resolved = useTheme((state) => state.resolved)
  const setTheme = useTheme((state) => state.set)
  useEffect(() => {
    const menu = menus.find((item) => item.path === location.pathname)
    if (menu?.path) visit({ path: menu.path, title: menu.title })
  }, [location.pathname, menus, visit])
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      clear()
      queryClient.clear()
      await navigate("/login", { replace: true })
    },
  })
  const actions = <><Button variant="ghost" size="icon" aria-label="切换浅色或深色主题" onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}>{resolved === "dark" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}</Button><Button variant="ghost" className="flex-1 justify-start" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOutIcon className="size-4" />退出登录</Button></>
  return <Layout navigation={<Navigation />} actions={actions} />
}

export { SessionGate as NormalLayout }
