import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileIcon,
  ImageIcon,
  LoaderCircleIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"
import { useApi, type ClipboardItem, type ClipboardRepresentation, type Transfer } from "@/api"
import { ConfirmAction } from "@/components/domain/confirm-action"
import { DeviceIcon } from "@/components/domain/device-icon"
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
import { LocalizedError } from "@/frame/common/error"
import { i18n } from "@/frame/common/i18n"
import { usePreferences } from "@/stores"
import { errorMessage, formatBytes, formatDate, formatProgress, messageOf } from "@/utils/format"

async function clipboardImage(blob: Blob, mimeType: string): Promise<Blob> {
  const source = blob.type.startsWith("image/") ? blob : new Blob([blob], { type: mimeType })
  if (source.type === "image/png") return source

  const bitmap = await createImageBitmap(source)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext("2d")
    if (!context) throw new LocalizedError("clipboard:imageProcessingFailed")
    context.drawImage(bitmap, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((converted) => {
        if (converted) resolve(converted)
        else reject(new LocalizedError("clipboard:imageProcessingFailed"))
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
      throw new LocalizedError("clipboard:imageCopyUnsupported")
    }
    const image = api.content(item.id, content.id).then((blob) => clipboardImage(blob, content.mimeType))
    await clipboard.write([new globalThis.ClipboardItem({ "image/png": image })])
  } else {
    throw new LocalizedError("clipboard:contentCopyUnsupported")
  }
  toast.success(i18n.t("clipboard:copied"))
}

async function downloadContent(api: ReturnType<typeof useApi>, item: ClipboardItem, content: ClipboardRepresentation): Promise<void> {
  const blob = await api.content(item.id, content.id)
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `${item.id}.${content.mimeType.split("/")[1]?.split(";")[0] ?? "bin"}`
  link.click()
  URL.revokeObjectURL(url)
  toast.success(i18n.t("clipboard:downloadStarted"))
}

const terminalTransferStates = new Set(["completed", "failed", "cancelled", "expired"])

function useTransferFeedback(transferId: string | undefined, transfer: Transfer | undefined, error: unknown) {
  const reported = useRef<string | null>(null)
  const { t } = useTranslation("clipboard")
  useEffect(() => {
    const state = error ? "error" : transfer?.state
    if (!transferId || !state || (!error && !terminalTransferStates.has(state))) return
    const result = `${transferId}:${state}`
    if (reported.current === result) return
    reported.current = result
    const options = { id: `content-transfer-${transferId}` }
    if (error) toast.error(messageOf(error), options)
    else if (state === "completed") toast.success(t("contentReady"), options)
    else if (state === "cancelled") toast.info(t("contentCancelled"), options)
    else if (state === "expired") toast.error(errorMessage("transfer_expired"), options)
    else toast.error(transfer?.error.code ? errorMessage(transfer.error.code) : t("contentFailed"), options)
  }, [transferId, transfer?.state, transfer?.error.code, error, t])
}

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
  const { t } = useTranslation("clipboard")
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
          alt={t(fullImage ? "fullImageFrom" : "previewImageFrom", { name: item.origin.tag })}
        />
        {loading ? (
          <span className="absolute inset-0 grid place-items-center bg-background/70" aria-label={t("syncingImage")}>
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
        {loading ? <LoaderCircleIcon className="absolute size-6 animate-spin text-primary" aria-label={t("syncingImage")} /> : null}
      </div>
    )
  }
  if (text.isPending) return <div className="min-h-36 animate-pulse bg-muted/45" aria-label={t("loadingPreview")} />
  if (text.error) return <div className="grid min-h-36 place-items-center text-sm text-destructive">{t("previewUnavailable")}</div>
  return (
    <div className={expanded ? "max-h-[55vh] overflow-auto bg-muted/25 p-5" : "min-h-36 bg-muted/25 p-4"}>
      <p className={expanded ? "whitespace-pre-wrap text-sm leading-6" : "line-clamp-6 whitespace-pre-wrap text-sm leading-6"}>
        {text.data}
      </p>
      {preview.truncated ? <p className="mt-3 text-xs text-muted-foreground">{t("previewTruncated")}</p> : null}
    </div>
  )
}

function ContentAction({ item, content, available = false }: {
  readonly item: ClipboardItem
  readonly content: ClipboardRepresentation
  readonly available?: boolean
}) {
  const { t } = useTranslation("clipboard")
  const api = useApi()
  const [transferId, setTransferId] = useState<string>()
  const request = useMutation({
    mutationFn: () => api.requestContent(item.id, content.id),
    onSuccess: ({ transfer }) => {
      setTransferId(transfer.id)
      toast.info(t("contentRequested"), { id: `content-transfer-${transfer.id}` })
    },
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
  useTransferFeedback(transferId, transfer.data ?? request.data?.transfer, transfer.error)
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
            title={t("copy")}
            aria-label={t(image ? "copyImage" : "copyContent")}
            onClick={() => copyContent(api, item, content).catch((error) => toast.error(messageOf(error)))}
          >
            <CopyIcon className="size-4" />
          </Button>
        ) : null}
        {!text ? (
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("download")}
            aria-label={t("downloadContent")}
            onClick={() => downloadContent(api, item, content).catch((error) => toast.error(messageOf(error)))}
          >
            <DownloadIcon className="size-4" />
          </Button>
        ) : null}
      </>
    )
  }
  if (transfer.data && !["failed", "cancelled", "expired"].includes(transfer.data.state)) {
    return <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" aria-label={t("fetchingContent")} />
  }
  return (
    <Button variant="outline" size="sm" disabled={request.isPending} onClick={() => request.mutate()}>
      {request.isPending ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : <DownloadIcon className="size-3.5" />}
      {t("getContent")}
    </Button>
  )
}

export function ClipboardItemCard({ item, transfer, remove }: {
  readonly item: ClipboardItem
  readonly transfer?: Transfer
  readonly remove: (item: ClipboardItem) => void
}) {
  const { t } = useTranslation("clipboard")
  const api = useApi()
  usePreferences((state) => state.offsetMinutes)
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
      toast.info(t("contentRequested"), { id: `content-transfer-${requested.id}` })
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
  useTransferFeedback(imageTransferId, requestedTransfer, imageTransfer.error)
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
  return (
    <article className="mb-4 inline-block w-full break-inside-avoid overflow-hidden rounded-[8px] border bg-card text-card-foreground shadow-sm">
      <button type="button" className="block w-full text-left" onClick={showPreview} aria-label={t("viewContent")}>
        <Preview item={item} fullImage={Boolean(imageReady)} loading={imageLoading} />
      </button>
      {activeTransfer ? (
        <div className="border-t px-3 py-2">
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{t(displayedTransfer.state === "waiting-for-peer" ? "waitingSource" : "transferring")}</span>
            <span>{formatProgress(displayedTransfer.completedBytes, displayedTransfer.totalBytes)}</span>
          </div>
          <Progress value={displayedTransfer.totalBytes ? displayedTransfer.completedBytes / displayedTransfer.totalBytes * 100 : 0} />
        </div>
      ) : null}
      <footer className="flex min-h-12 items-center gap-2 border-t px-3 py-2">
        <DeviceIcon device={item.origin} className="size-4" />
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
        <Button variant="ghost" size="icon-sm" title={t("view")} aria-label={t("viewDetails")} onClick={showPreview}>
          <EyeIcon className="size-4" />
        </Button>
        <ConfirmAction
          trigger={<Button variant="ghost" size="icon-sm" title={t("delete")} aria-label={t("deleteItem")}><Trash2Icon className="size-4 text-destructive" /></Button>}
          title={t("deleteItemTitle")}
          description={t("deleteItemDescription")}
          confirmLabel={t("delete")}
          onConfirm={() => remove(item)}
        />
      </footer>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><DeviceIcon device={item.origin} className="size-4" />{item.origin.tag}</DialogTitle>
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
