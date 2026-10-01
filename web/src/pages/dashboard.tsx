import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { usePreferences } from "@/stores"
import { CableIcon, ClipboardListIcon, NetworkIcon, TriangleAlertIcon } from "lucide-react"
import { useApi } from "@/api"
import { ErrorState, LoadingState } from "@/components/domain/states"
import { StatusBadge } from "@/components/domain/status-badge"
import { Page } from "@/frame/layout"
import { formatDate } from "@/utils/format"

export function DashboardPage() {
  const { t } = useTranslation("clipboard")
  usePreferences((state) => state.offsetMinutes)
  const api = useApi()
  const query = useQuery({ queryKey: ["overview"], queryFn: () => api.overview(), refetchInterval: 15_000 })
  if (query.isPending) return <Page title={t("overview")} description={t("serverStatus")}><LoadingState /></Page>
  if (query.error) return <Page title={t("overview")} description={t("serverStatus")}><ErrorState error={query.error} retry={() => query.refetch()} /></Page>
  const cards = [
    { label: t("devices"), value: query.data.devices.total, detail: t("onlineDevices", { count: query.data.devices.online }), icon: CableIcon },
    { label: t("channels"), value: query.data.channels, detail: t("currentlyAvailable"), icon: NetworkIcon },
    { label: t("clipboardItems"), value: query.data.items, detail: t("published"), icon: ClipboardListIcon },
    { label: t("failedTransfers"), value: query.data.failedTransfers, detail: t("needsAttention"), icon: TriangleAlertIcon },
  ]
  return (
    <Page title={t("overview")} description={t("overviewDescription")}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <section key={label} className="surface-raised p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{label}</p>
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </section>
        ))}
      </div>
      <section className="surface-raised mt-6 overflow-hidden">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold">{t("recentTransfers")}</h2>
        </div>
        {query.data.recentTransfers.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{t("noTransfers")}</p>
        ) : (
          <ul className="divide-y">
            {query.data.recentTransfers.map((transfer) => (
              <li key={transfer.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <StatusBadge value={transfer.state} />
                <span className="font-medium">{t(transfer.kind === "publish" ? "publish" : "materialization")}</span>
                <code className="max-w-48 truncate text-xs text-muted-foreground">{transfer.itemId}</code>
                <time className="ml-auto text-xs text-muted-foreground">{formatDate(transfer.updatedAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  )
}
