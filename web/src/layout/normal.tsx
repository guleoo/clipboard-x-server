import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ClipboardIcon,
  HistoryIcon,
  LaptopIcon,
  LogOutIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  UserRoundIcon,
  ArchiveIcon,
} from "lucide-react"
import { Navigate, NavLink, useLocation, useNavigate } from "react-router"
import { useApi } from "@/api"
import { ErrorState, LoadingState } from "@/components/domain/states"
import { Button } from "@/frame/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/frame/components/ui/dropdown-menu"
import { Layout } from "@/frame/layout/normal"
import { RequestError } from "@/frame/request"
import { useAuth, useTabs, useTheme } from "@/stores"

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
  const visit = useTabs((state) => state.visit)
  const administrator = useAuth((state) => state.administrator)
  const clear = useAuth((state) => state.clear)
  const resolved = useTheme((state) => state.resolved)
  const setTheme = useTheme((state) => state.set)
  useEffect(() => {
    visit({ path: location.pathname, title: location.pathname === "/" ? "剪切板" : "设置" })
  }, [location.pathname, visit])
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      clear()
      queryClient.clear()
      await navigate("/login", { replace: true })
    },
  })
  const brand = (
    <NavLink to="/" className="flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 font-semibold">
      <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
        <ClipboardIcon className="size-4" aria-hidden="true" />
      </span>
      <span className="hidden text-sm sm:inline">Clipboard X</span>
    </NavLink>
  )
  const navigation = (
    <nav aria-label="主导航" className="flex items-center">
      <NavLink
        to="/"
        end
        className={({ isActive }) => [
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        剪切板
      </NavLink>
    </nav>
  )
  const actions = (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="切换浅色或深色主题"
        onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
      >
        {resolved === "dark" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="打开设置菜单" />}>
          <SettingsIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{administrator?.username ?? "管理员"}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigate("/devices")}>
              <LaptopIcon />设备
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/activity")}>
              <HistoryIcon />活动
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/retention")}>
              <ArchiveIcon />保留策略
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/account")}>
              <UserRoundIcon />账户
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={logout.isPending} onClick={() => logout.mutate()}>
            <LogOutIcon />退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
  return <Layout brand={brand} navigation={navigation} actions={actions} />
}

export { SessionGate as NormalLayout }
