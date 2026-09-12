import { useQuery } from "@tanstack/react-query"
import { CableIcon, ClipboardListIcon, NetworkIcon, TriangleAlertIcon } from "lucide-react"
import { useApi } from "@/api"
import { ErrorState, LoadingState } from "@/components/domain/states"
import { StatusBadge } from "@/components/domain/status-badge"
import { Page } from "@/frame/layout"
import { formatDate } from "@/utils/format"

export function DashboardPage() {
  const api = useApi()
  const query = useQuery({ queryKey: ["overview"], queryFn: () => api.overview(), refetchInterval: 15_000 })
  if (query.isPending) return <Page title="概览" description="服务器当前状态。"><LoadingState /></Page>
  if (query.error) return <Page title="概览" description="服务器当前状态。"><ErrorState error={query.error} retry={() => query.refetch()} /></Page>
  const cards = [
    { label: "设备", value: query.data.devices.total, detail: `${query.data.devices.online} 台在线`, icon: CableIcon },
    { label: "Channel", value: query.data.channels, detail: "当前可用", icon: NetworkIcon },
    { label: "剪切板条目", value: query.data.items, detail: "已发布", icon: ClipboardListIcon },
    { label: "失败传输", value: query.data.failedTransfers, detail: "需要检查", icon: TriangleAlertIcon },
  ]
  return (
    <Page title="概览" description="设备同步、Channel、条目和传输的实时摘要。">
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
          <h2 className="text-sm font-semibold">最近传输</h2>
        </div>
        {query.data.recentTransfers.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">还没有传输记录。</p>
        ) : (
          <ul className="divide-y">
            {query.data.recentTransfers.map((transfer) => (
              <li key={transfer.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <StatusBadge value={transfer.state} />
                <span className="font-medium">{transfer.kind === "publish" ? "发布" : "内容物化"}</span>
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
