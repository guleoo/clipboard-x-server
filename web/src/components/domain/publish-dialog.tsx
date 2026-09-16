import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { FileImageIcon, PlusIcon, TypeIcon } from "lucide-react"
import { toast } from "sonner"
import { useApi, type Channel, type Publication } from "@/api"
import { Button } from "@/frame/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/frame/components/ui/dialog"
import { Input } from "@/frame/components/ui/input"
import { Label } from "@/frame/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/frame/components/ui/tabs"
import { Textarea } from "@/frame/components/ui/textarea"
import { formatBytes, messageOf } from "@/utils/format"

const textPreviewCharacters = 6_000
const directImagePreviewBytes = 900 * 1024

async function thumbnail(file: File): Promise<Blob | undefined> {
  if (file.size <= directImagePreviewBytes) return file
  if (typeof createImageBitmap !== "function") return undefined
  const image = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 960 / Math.max(image.width, image.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext("2d")
    if (!context) return undefined
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ?? undefined), "image/webp", 0.82))
  } finally {
    image.close()
  }
}

export function PublishDialog({ channel, published }: {
  readonly channel: Channel
  readonly published: (publication: Publication) => void
}) {
  const api = useApi()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"text" | "image">("text")
  const [text, setText] = useState("")
  const [file, setFile] = useState<File>()
  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "text") {
        const preview = text.slice(0, textPreviewCharacters)
        return api.publish(channel.id, {
          content: new Blob([text], { type: "text/plain;charset=utf-8" }),
          preview: {
            content: new Blob([preview], { type: "text/plain;charset=utf-8" }),
            truncated: preview.length < text.length,
          },
        })
      }
      if (!file) throw new Error("请选择图片")
      const preview = await thumbnail(file)
      return api.publish(channel.id, {
        content: file,
        ...(preview ? { preview: { content: preview, truncated: false } } : {}),
      })
    },
    onSuccess: (publication) => {
      setOpen(false)
      setText("")
      setFile(undefined)
      published(publication)
      toast.success(`已发布到 ${channel.name}`)
    },
  })
  const ready = mode === "text" ? text.length > 0 : Boolean(file)
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!mutation.isPending) setOpen(value) }}>
      <DialogTrigger render={<Button />}><PlusIcon className="size-4" />添加内容</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={(event) => { event.preventDefault(); mutation.mutate() }}>
          <DialogHeader>
            <DialogTitle>添加到 {channel.name}</DialogTitle>
            <DialogDescription className="sr-only">添加文本或图片到当前 Channel</DialogDescription>
          </DialogHeader>
          <Tabs value={mode} onValueChange={(value) => setMode(value as "text" | "image")} className="py-4">
            <TabsList>
              <TabsTrigger value="text"><TypeIcon />文本</TabsTrigger>
              <TabsTrigger value="image"><FileImageIcon />图片</TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="pt-3">
              <Label htmlFor="clipboard-text" className="sr-only">文本内容</Label>
              <Textarea
                id="clipboard-text"
                className="min-h-56"
                placeholder="输入要同步的内容"
                value={text}
                onChange={(event) => setText(event.target.value)}
                autoFocus
              />
            </TabsContent>
            <TabsContent value="image" className="pt-3">
              <label htmlFor="clipboard-image" className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed bg-muted/25 px-6 text-center hover:bg-muted/45">
                <FileImageIcon className="mb-3 size-8 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium">{file?.name ?? "选择图片"}</span>
                {file ? <span className="mt-1 text-xs text-muted-foreground">{formatBytes(file.size)}</span> : null}
              </label>
              <Input
                id="clipboard-image"
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => setFile(event.target.files?.[0])}
              />
            </TabsContent>
          </Tabs>
          {mutation.error ? <p className="mb-4 text-sm text-destructive" role="alert">{messageOf(mutation.error)}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={!ready || mutation.isPending}>
              {mutation.isPending ? "正在发布…" : "发布"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
