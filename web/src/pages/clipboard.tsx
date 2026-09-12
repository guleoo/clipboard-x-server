import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ClipboardCopyIcon, DownloadIcon, EyeIcon, LoaderCircleIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { useApi, type ClipboardItem, type ClipboardRepresentation, type Transfer } from "@/api"
import { ConfirmAction } from "@/components/domain/confirm-action"
import { EmptyState, ErrorState, LoadingState } from "@/components/domain/states"
import { StatusBadge } from "@/components/domain/status-badge"
import { Button } from "@/frame/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/frame/components/ui/dialog"
import { Input } from "@/frame/components/ui/input"
import { Progress } from "@/frame/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/frame/components/ui/table"
import { Page } from "@/frame/layout"
import { formatBytes, formatDate, formatProgress, messageOf } from "@/utils/format"

function Preview({ item }: { readonly item: ClipboardItem }) {
  const api = useApi()
  const preview = item.previews[0]
  const text = useQuery({
    queryKey: ["preview", item.id, preview?.id],
    queryFn: async () => (await api.preview(item.id, preview!.id)).text(),
    enabled: Boolean(preview?.mimeType.startsWith("text/")),
    staleTime: Infinity,
  })
  if (!preview) return <span className="text-xs text-muted-foreground">无预览</span>
  if (preview.mimeType.startsWith("image/")) {
    return (
      <img
        className="h-14 w-20 rounded-md border bg-muted object-contain"
        src={`/admin/api/v1/items/${encodeURIComponent(item.id)}/previews/${encodeURIComponent(preview.id)}`}
        alt={`来自 ${item.origin.tag} 的图片缩略图`}
      />
    )
  }
  if (text.isPending) return <span className="text-xs text-muted-foreground">加载预览…</span>
  if (text.error) return <span className="text-xs text-destructive">预览不可用</span>
  return (
    <p className="line-clamp-3 max-w-xl whitespace-pre-wrap text-sm leading-5">
      {text.data}{preview.truncated ? <span className="text-muted-foreground"> …（已截断）</span> : null}
    </p>
  )
}

async function consumeContent(api: ReturnType<typeof useApi>, item: ClipboardItem, content: ClipboardRepresentation): Promise<void> {
  const blob = await api.content(item.id, content.id)
  if (content.mimeType.startsWith("text/")) {
    await navigator.clipboard.writeText(await blob.text())
    toast.success("文本已复制到剪切板")
    return
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${item.id}.${content.mimeType.split("/")[1]?.split(";")[0] ?? "bin"}`
  link.click()
  URL.revokeObjectURL(url)
  toast.success("下载已开始")
}

function ContentAction({ item, content }: { readonly item: ClipboardItem; readonly content: ClipboardRepresentation }) {
  const api = useApi()
  const [transferId, setTransferId] = useState<string>()
  const request = useMutation({
    mutationFn: () => api.requestContent(item.id, content.id),
    onSuccess: ({ transfer }) => setTransferId(transfer.id),
    onError: (error) => toast.error(messageOf(error)),
  })
  const transfer = useQuery({
    queryKey: ["transfer", transferId],
    queryFn: () => api.transfer(transferId!),
    enabled: Boolean(transferId),
    refetchInterval: (query) => {
      const current = query.state.data as Transfer | undefined
      return current && ["completed", "failed", "cancelled", "expired"].includes(current.state) ? false : 1_500
    },
  })
  const ready = content.availability === "available" || transfer.data?.state === "completed"
  if (ready) {
    return (
      <Button variant="outline" size="sm" onClick={() => consumeContent(api, item, content).catch((error) => toast.error(messageOf(error)))}>
        {content.mimeType.startsWith("text/") ? <ClipboardCopyIcon className="size-3.5" /> : <DownloadIcon className="size-3.5" />}
        {content.mimeType.startsWith("text/") ? "复制" : "下载"}
      </Button>
    )
  }
  if (transfer.data && !["failed", "cancelled", "expired"].includes(transfer.data.state)) {
    return (
      <div className="min-w-40">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{transfer.data.state === "waiting-for-peer" ? "等待来源设备" : "正在物化"}</span>
          <span>{formatProgress(transfer.data.completedBytes, transfer.data.totalBytes)}</span>
        </div>
        <Progress value={transfer.data.totalBytes ? (transfer.data.completedBytes / transfer.data.totalBytes) * 100 : 0} />
      </div>
    )
  }
  return (
    <Button variant="outline" size="sm" disabled={request.isPending} onClick={() => request.mutate()}>
      {request.isPending ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : <DownloadIcon className="size-3.5" />}
      请求完整内容
    </Button>
  )
}

function ItemDetail({ item, close }: { readonly item: ClipboardItem | undefined; readonly close: () => void }) {
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>剪切板条目</DialogTitle>
          <DialogDescription>{item?.channelName} · {item ? formatDate(item.createdAt) : ""}</DialogDescription>
        </DialogHeader>
        {item ? (
          <div className="space-y-5">
            <div className="surface-sunken max-h-64 overflow-auto p-4"><Preview item={item} /></div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">内容表示</p>
              <ul className="space-y-2">
                {item.contents.map((content) => (
                  <li key={content.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{content.mimeType}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatBytes(content.size)} · {content.delivery}</p>
                    </div>
                    <StatusBadge value={content.availability} />
                    <ContentAction item={item} content={content} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function ClipboardPage() {
  const api = useApi()
  const client = useQueryClient()
  const [search, setSearch] = useSearchParams()
  const [detail, setDetail] = useState<ClipboardItem>()
  const queryText = search.get("query") ?? ""
  const channelId = search.get("channelId")
  const deviceId = search.get("deviceId")
  const mimeType = search.get("mimeType")
  const cursor = search.get("cursor")
  const filters = {
    ...(channelId ? { channelId } : {}),
    ...(deviceId ? { deviceId } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(queryText ? { query: queryText } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 50,
  }
  const items = useQuery({ queryKey: ["items", filters], queryFn: () => api.items(filters) })
  const channels = useQuery({ queryKey: ["channels"], queryFn: () => api.channels() })
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api.devices() })
  const remove = useMutation({
    mutationFn: (item: ClipboardItem) => api.deleteItem(item.id),
    onSuccess: () => { client.invalidateQueries({ queryKey: ["items"] }); toast.success("条目已删除") },
    onError: (error) => toast.error(messageOf(error)),
  })
  const updateFilter = (key: string, value: string) => {
    setSearch((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value)
      else next.delete(key)
      if (key !== "cursor") next.delete("cursor")
      return next
    })
  }
  return (
    <Page title="剪切板" description="按需加载预览和完整内容；列表不会隐式下载原始图片或大文本。">
      <div className="surface-raised mb-5 grid gap-3 p-4 md:grid-cols-5">
        <label className="relative md:col-span-2">
          <span className="sr-only">搜索条目</span>
          <SearchIcon className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input className="pl-8" value={queryText} placeholder="搜索设备或 Channel" onChange={(event) => updateFilter("query", event.target.value)} />
        </label>
        <label>
          <span className="sr-only">按 Channel 筛选</span>
          <select className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm" value={filters.channelId ?? ""} onChange={(event) => updateFilter("channelId", event.target.value)}>
            <option value="">全部 Channel</option>
            {channels.data?.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">按来源设备筛选</span>
          <select className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm" value={filters.deviceId ?? ""} onChange={(event) => updateFilter("deviceId", event.target.value)}>
            <option value="">全部设备</option>
            {devices.data?.map((device) => <option key={device.id} value={device.id}>{device.tag}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">按 MIME 类型筛选</span>
          <select className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm" value={filters.mimeType ?? ""} onChange={(event) => updateFilter("mimeType", event.target.value)}>
            <option value="">全部类型</option>
            <option value="text/">文本</option>
            <option value="image/">图片</option>
            <option value="application/">应用数据</option>
          </select>
        </label>
      </div>
      {items.isPending ? <LoadingState /> : items.error ? <ErrorState error={items.error} retry={() => items.refetch()} />
        : items.data.items.length === 0 ? <EmptyState title="没有匹配的条目" description="设备发布的剪切板条目会显示在这里。" />
        : (
          <div className="surface-raised overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow><TableHead>预览</TableHead><TableHead>来源</TableHead><TableHead>Channel</TableHead><TableHead>时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {items.data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="min-w-64"><Preview item={item} /></TableCell>
                    <TableCell><p className="font-medium">{item.origin.tag}</p><code className="text-xs text-muted-foreground">{item.origin.deviceId.slice(0, 8)}</code></TableCell>
                    <TableCell>{item.channelName}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(item.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label="查看条目" onClick={() => setDetail(item)}><EyeIcon className="size-4" /></Button>
                        <ConfirmAction
                          trigger={<Button variant="ghost" size="icon-sm" aria-label="删除条目"><Trash2Icon className="size-4 text-destructive" /></Button>}
                          title="删除此剪切板条目？"
                          description="所有 Channel 成员都会收到 remove 变化；关联对象会进入回收宽限期。"
                          confirmLabel="删除"
                          pending={remove.isPending}
                          onConfirm={() => remove.mutate(item)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {items.data.hasMore ? (
              <div className="border-t p-3 text-center">
                <Button variant="outline" onClick={() => updateFilter("cursor", items.data.cursor)}>下一页</Button>
              </div>
            ) : null}
          </div>
        )}
      <ItemDetail item={detail} close={() => setDetail(undefined)} />
    </Page>
  )
}
