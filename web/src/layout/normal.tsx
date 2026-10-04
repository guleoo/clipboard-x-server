import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
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
  SlidersHorizontalIcon,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/frame/components/ui/dropdown-menu"
import { Layout } from "@/frame/layout/normal"
import { RequestError } from "@/frame/request"
import { useAuth, usePreferences, useTabs, useTheme } from "@/stores"
import { messageOf } from "@/utils/format"

function SessionGate() {
  const { t } = useTranslation("common")
  const api = useApi()
  const establish = useAuth((state) => state.establish)
  const clear = useAuth((state) => state.clear)
  const query = useQuery({ queryKey: ["session"], queryFn: api.session, retry: false })
  useEffect(() => {
    if (query.data) establish(query.data.administrator)
    else if (query.error instanceof RequestError && query.error.status === 401) clear()
  }, [clear, establish, query.data, query.error])
  if (query.isPending) return <LoadingState label={t("validatingSession")} />
  if (query.error instanceof RequestError && query.error.status === 401) return <Navigate replace to="/login" />
  if (query.error) return <main className="p-6"><ErrorState error={query.error} retry={() => query.refetch()} /></main>
  return <AuthenticatedLayout />
}

function AuthenticatedLayout() {
  const { t, i18n } = useTranslation("common")
  const setLanguage = usePreferences((state) => state.setLanguage)
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
    visit({ path: location.pathname })
  }, [location.pathname, visit])
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      clear()
      queryClient.clear()
      await navigate("/login", { replace: true })
      toast.success(t("signedOut"))
    },
    onError: (error) => toast.error(messageOf(error)),
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
    <nav aria-label={t("navigation")} className="flex items-center">
      <NavLink
        to="/"
        end
        className={({ isActive }) => [
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        {t("clipboard")}
      </NavLink>
    </nav>
  )
  const actions = (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("toggleTheme")}
        onClick={() => {
          const next = resolved === "dark" ? "light" : "dark"
          setTheme(next)
          toast.success(t(next === "dark" ? "darkThemeUpdated" : "lightThemeUpdated"))
        }}
      >
        {resolved === "dark" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
      </Button>
      <Button variant="ghost" size="icon" nativeButton={false} render={<NavLink to="/devices" />}
        aria-label={t("devices")} title={t("devices")}>
        <LaptopIcon className="size-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={t("openSettings")} />}>
          <SettingsIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{administrator?.username ?? t("administrator")}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigate("/activity")}>
              <HistoryIcon />{t("activity")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/configuration")}>
              <SlidersHorizontalIcon />{t("configuration")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/account")}>
              <UserRoundIcon />{t("account")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={i18n.resolvedLanguage ?? "en"}
            onValueChange={(value) => {
              if ((value === "en" || value === "zh-CN") && value !== i18n.resolvedLanguage) {
                setLanguage(value)
                toast.success(i18n.t("languageUpdated", { lng: value }))
              }
            }}
          >
            <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
            <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="zh-CN">简体中文</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={logout.isPending} onClick={() => logout.mutate()}>
            <LogOutIcon />{t("logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
  return <Layout brand={brand} navigation={navigation} actions={actions} />
}

export { SessionGate as NormalLayout }
