import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileIcon,
  ImageIcon,
  LoaderCircleIcon,
  MonitorIcon,
  ServerIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import { useApi, type ClipboardItem, type ClipboardRepresentation, type Transfer } from "@/api"
import { ConfirmAction } from "@/components/domain/confirm-action"
import { StatusBadge } from "@/components/domain/status-badge"
import { Button } from "@/frame/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/frame/components/ui/dialog"
import { Progress } from "@/frame/components/ui/progress"
import { formatBytes, formatDate, formatProgress, messageOf } from "@/utils/format"

async function clipboardImage(blob: Blob, mimeType: string): Promise<Blob> {
  const source = blob.type.startsWith("image/") ? blob : new Blob([blob], { type: mimeType })
  if (source.type === "image/png") return source

  const bitmap = await createImageBitmap(source)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("无法处理需要复制的图片")
    context.drawImage(bitmap, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((converted) => {
        if (converted) resolve(converted)
        else reject(new Error("无法处理需要复制的图片"))
      }, "image/png")
    })
  } finally {
    bitmap.close()
  }
}

async function copyContent(api: ReturnType<typeof useApi>, item: ClipboardItem, content: ClipboardRepresentation): Promise<void> {
  if (content.mimeType.startsWith("text/")) {
    const blob = await api.content(item.id, content.id)
    await navigator.clipboard.writeText(await blob.text())
  } else if (content.mimeType.startsWith("image/")) {
    const clipboard = navigator.clipboard
    if (
      typeof globalThis.ClipboardItem !== "function"
      || typeof clipboard?.write !== "function"
      || (typeof globalThis.ClipboardItem.supports === "function" && !globalThis.ClipboardItem.supports("image/png"))
    ) {
      throw new Error("当前浏览器不支持复制图片")
    }
    const image = api.content(item.id, content.id).then((blob) => clipboardImage(blob, content.mimeType))
    await clipboard.write([new globalThis.ClipboardItem({ "image/png": image })])
  } else {
    throw new Error("当前内容不能复制")
  }
  toast.success("已复制")
}

async function downloadContent(api: ReturnType<typeof useApi>, item: ClipboardItem, content: ClipboardRepresentation): Promise<void> {
  const blob = await api.content(item.id, content.id)
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${item.id}.${content.mimeType.split("/")[1]?.split(";")[0] ?? "bin"}`
  link.click()
  URL.revokeObjectURL(url)
}

const terminalTransferStates = new Set(["completed", "failed", "cancelled", "expired"])

function imageContentOf(item: ClipboardItem): ClipboardRepresentation | undefined {
  const previewContentId = item.previews.find((preview) => preview.mimeType.startsWith("image/"))?.contentId
  return item.contents.find((content) => content.id === previewContentId && content.mimeType.startsWith("image/"))
    ?? item.contents.find((content) => content.mimeType.startsWith("image/"))
}

function Preview({ item, expanded = false, fullImage = false, loading = false }: {
  readonly item: ClipboardItem
  readonly expanded?: boolean
  readonly fullImage?: boolean
  readonly loading?: boolean
}) {
  const api = useApi()
  const preview = item.previews[0]
  const imageContent = imageContentOf(item)
  const text = useQuery({
    queryKey: ["preview", item.id, preview?.id],
    queryFn: async () => (await api.preview(item.id, preview!.id)).text(),
    enabled: Boolean(preview?.mimeType.startsWith("text/")),
    staleTime: Infinity,
  })
  const imageSource = fullImage && imageContent
    ? `/admin/api/v1/items/${encodeURIComponent(item.id)}/contents/${encodeURIComponent(imageContent.id)}`
    : preview?.mimeType.startsWith("image/")
      ? `/admin/api/v1/items/${encodeURIComponent(item.id)}/previews/${encodeURIComponent(preview.id)}`
      : undefined
  if (imageSource) {
    return (
      <div className={`relative ${expanded ? "grid max-h-[60vh] place-items-center bg-muted/30" : "grid aspect-[4/3] place-items-center bg-muted/30"}`}>
        <img
          className={expanded ? "max-h-[60vh] w-full object-contain" : "size-full object-contain"}
          src={imageSource}
          alt={`来自 ${item.origin.tag} 的${fullImage ? "完整图片" : "图片预览"}`}
        />
        {loading ? (
          <span className="absolute inset-0 grid place-items-center bg-background/70" aria-label="正在同步完整图片">
            <LoaderCircleIcon className="size-6 animate-spin text-primary" />
          </span>
        ) : null}
      </div>
    )
  }
  if (!preview) {
    const Icon = imageContent ? ImageIcon : FileIcon
    return (
      <div className="relative grid min-h-36 place-items-center bg-muted/35 text-muted-foreground">
        <Icon className="size-7" aria-hidden="true" />
        {loading ? <LoaderCircleIcon className="absolute size-6 animate-spin text-primary" aria-label="正在同步完整图片" /> : null}
      </div>
    )
  }
  if (text.isPending) return <div className="min-h-36 animate-pulse bg-muted/45" aria-label="正在加载预览" />
  if (text.error) return <div className="grid min-h-36 place-items-center text-sm text-destructive">预览不可用</div>
  return (
    <div className={expanded ? "max-h-[55vh] overflow-auto bg-muted/25 p-5" : "min-h-36 bg-muted/25 p-4"}>
      <p className={expanded ? "whitespace-pre-wrap text-sm leading-6" : "line-clamp-6 whitespace-pre-wrap text-sm leading-6"}>
        {text.data}
      </p>
      {preview.truncated ? <p className="mt-3 text-xs text-muted-foreground">预览已截断</p> : null}
    </div>
  )
}

function ContentAction({ item, content, available = false }: {
  readonly item: ClipboardItem
  readonly content: ClipboardRepresentation
  readonly available?: boolean
}) {
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
      const value = query.state.data as Transfer | undefined
      return value && ["completed", "failed", "cancelled", "expired"].includes(value.state) ? false : 1_500
    },
  })
  const ready = available || content.availability === "available" || transfer.data?.state === "completed"
  if (ready) {
    const text = content.mimeType.startsWith("text/")
    const image = content.mimeType.startsWith("image/")
    return (
      <>
        {text || image ? (
          <Button
            variant="ghost"
            size="icon-sm"
            title="复制"
            aria-label={image ? "复制图片" : "复制完整内容"}
            onClick={() => copyContent(api, item, content).catch((error) => toast.error(messageOf(error)))}
          >
            <CopyIcon className="size-4" />
          </Button>
        ) : null}
        {!text ? (
          <Button
            variant="ghost"
            size="icon-sm"
            title="下载"
            aria-label="下载完整内容"
            onClick={() => downloadContent(api, item, content).catch((error) => toast.error(messageOf(error)))}
          >
            <DownloadIcon className="size-4" />
          </Button>
        ) : null}
      </>
    )
  }
  if (transfer.data && !["failed", "cancelled", "expired"].includes(transfer.data.state)) {
    return <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" aria-label="正在获取完整内容" />
  }
  return (
    <Button variant="outline" size="sm" disabled={request.isPending} onClick={() => request.mutate()}>
      {request.isPending ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : <DownloadIcon className="size-3.5" />}
      获取内容
    </Button>
  )
}

export function ClipboardItemCard({ item, transfer, remove }: {
  readonly item: ClipboardItem
  readonly transfer?: Transfer
  readonly remove: (item: ClipboardItem) => void
}) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [imageTransferId, setImageTransferId] = useState<string>()
  const primary = item.contents[0]
  const imageContent = imageContentOf(item)
  const requestImage = useMutation({
    mutationFn: () => api.requestContent(item.id, imageContent!.id),
    onSuccess: ({ transfer: requested }) => {
      setImageTransferId(requested.id)
      queryClient.setQueryData(["transfer", requested.id], requested)
    },
    onError: (error) => toast.error(messageOf(error)),
  })
  const imageTransfer = useQuery({
    queryKey: ["transfer", imageTransferId],
    queryFn: () => api.transfer(imageTransferId!),
    enabled: Boolean(imageTransferId),
    refetchInterval: (query) => {
      const value = query.state.data as Transfer | undefined
      return value && terminalTransferStates.has(value.state) ? false : 1_500
    },
  })
  const requestedTransfer = imageTransfer.data ?? requestImage.data?.transfer
  const imageReady = imageContent?.availability === "available" || requestedTransfer?.state === "completed"
  const imageLoading = requestImage.isPending || Boolean(requestedTransfer && !terminalTransferStates.has(requestedTransfer.state))
  const displayedTransfer = requestedTransfer ?? transfer
  const activeTransfer = displayedTransfer && !terminalTransferStates.has(displayedTransfer.state)
  useEffect(() => {
    if (requestedTransfer?.state === "completed") {
      queryClient.invalidateQueries({ queryKey: ["items"] })
    }
  }, [queryClient, requestedTransfer?.state])
  const showPreview = () => {
    setOpen(true)
    const retryable = imageTransfer.isError || !requestedTransfer || terminalTransferStates.has(requestedTransfer.state)
    if (imageContent && imageContent.availability !== "available" && retryable && !requestImage.isPending) {
      requestImage.mutate()
    }
  }
  const OriginIcon = item.origin.kind === "virtual" ? ServerIcon : MonitorIcon
  return (
    <article className="mb-4 inline-block w-full break-inside-avoid overflow-hidden rounded-[8px] border bg-card text-card-foreground shadow-sm">
      <button type="button" className="block w-full text-left" onClick={showPreview} aria-label="查看剪切板内容">
        <Preview item={item} fullImage={Boolean(imageReady)} loading={imageLoading} />
      </button>
      {activeTransfer ? (
        <div className="border-t px-3 py-2">
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{displayedTransfer.state === "waiting-for-peer" ? "等待来源" : "传输中"}</span>
            <span>{formatProgress(displayedTransfer.completedBytes, displayedTransfer.totalBytes)}</span>
          </div>
          <Progress value={displayedTransfer.totalBytes ? displayedTransfer.completedBytes / displayedTransfer.totalBytes * 100 : 0} />
        </div>
      ) : null}
      <footer className="flex min-h-12 items-center gap-2 border-t px-3 py-2">
        <OriginIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{item.origin.tag}</p>
          <time className="block text-[11px] text-muted-foreground">{formatDate(item.createdAt)}</time>
        </div>
        {primary ? (
          <ContentAction
            item={item}
            content={primary}
            available={primary.id === imageContent?.id && Boolean(imageReady)}
          />
        ) : null}
        <Button variant="ghost" size="icon-sm" title="查看" aria-label="查看详情" onClick={showPreview}>
          <EyeIcon className="size-4" />
        </Button>
        <ConfirmAction
          trigger={<Button variant="ghost" size="icon-sm" title="删除" aria-label="删除条目"><Trash2Icon className="size-4 text-destructive" /></Button>}
          title="删除此剪切板条目？"
          description="该内容会从 Channel 中移除。"
          confirmLabel="删除"
          onConfirm={() => remove(item)}
        />
      </footer>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><OriginIcon className="size-4" />{item.origin.tag}</DialogTitle>
            <DialogDescription>{item.channelName} · {formatDate(item.createdAt)}</DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-[8px] border">
            <Preview item={item} expanded fullImage={Boolean(imageReady)} loading={imageLoading} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {item.contents.map((content) => (
              <div key={content.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                <span>{content.mimeType}</span>
                <span className="text-muted-foreground">{formatBytes(content.size)}</span>
                <StatusBadge value={content.availability} />
                <ContentAction
                  item={item}
                  content={content}
                  available={content.id === imageContent?.id && Boolean(imageReady)}
                />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </article>
  )
}
