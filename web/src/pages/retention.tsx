import { useEffect, useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useApi, type Retention } from "@/api"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/frame/components/ui/alert-dialog"
import { ErrorState, LoadingState } from "@/components/domain/states"
import { Button } from "@/frame/components/ui/button"
import { Input } from "@/frame/components/ui/input"
import { Label } from "@/frame/components/ui/label"
import { Page } from "@/frame/layout"
import { messageOf } from "@/utils/format"

interface Draft {
  device: string
  channel: string
  days: string
  minutes: string
}

const dayMillis = 86_400_000
const minuteMillis = 60_000

function draftOf(policy: Retention): Draft {
  return {
    device: policy.maxItemsPerDevice?.toString() ?? "",
    channel: policy.maxItemsPerChannel?.toString() ?? "",
    days: policy.maxAgeMillis === undefined ? "" : String(policy.maxAgeMillis / dayMillis),
    minutes: String(policy.sweepIntervalMillis / minuteMillis),
  }
}

function positiveInteger(value: string, multiplier: number, label: string): number | undefined {
  if (value.trim() === "") return undefined
  const number = Number(value)
  const result = Math.round(number * multiplier)
  if (!Number.isFinite(number) || number <= 0 || !Number.isSafeInteger(result) || result <= 0
    || (multiplier === 1 && !Number.isInteger(number))) {
    throw new Error(`${label}必须是大于零的有效数字`)
  }
  return result
}

function policyOf(draft: Draft): Retention {
  const maxItemsPerDevice = positiveInteger(draft.device, 1, "每设备保留条数")
  const maxItemsPerChannel = positiveInteger(draft.channel, 1, "每 Channel 保留条数")
  const maxAgeMillis = positiveInteger(draft.days, dayMillis, "最长保留时间")
  const sweepIntervalMillis = positiveInteger(draft.minutes, minuteMillis, "清理间隔")
  if (sweepIntervalMillis === undefined || sweepIntervalMillis < minuteMillis || sweepIntervalMillis > dayMillis) {
    throw new Error("清理间隔必须在 1 到 1440 分钟之间")
  }
  return {
    ...(maxItemsPerDevice === undefined ? {} : { maxItemsPerDevice }),
    ...(maxItemsPerChannel === undefined ? {} : { maxItemsPerChannel }),
    ...(maxAgeMillis === undefined ? {} : { maxAgeMillis }),
    sweepIntervalMillis,
  }
}

function tightens(previous: Retention, next: Retention): boolean {
  return (["maxItemsPerDevice", "maxItemsPerChannel", "maxAgeMillis"] as const)
    .some((field) => (next[field] ?? Infinity) < (previous[field] ?? Infinity))
}

export function RetentionPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ["retention"], queryFn: api.retention })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState("")
  const [confirm, setConfirm] = useState<Retention | null>(null)
  useEffect(() => {
    if (query.data) setDraft((current) => current ?? draftOf(query.data))
  }, [query.data])
  const mutation = useMutation({
    mutationFn: api.updateRetention,
    onSuccess: (saved) => {
      queryClient.setQueryData(["retention"], saved)
      queryClient.invalidateQueries({ queryKey: ["items"] })
      setDraft(draftOf(saved))
      setConfirm(null)
      setError("")
      toast.success("保留策略已更新")
    },
  })
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || !query.data) return
    try {
      const next = policyOf(draft)
      setError("")
      mutation.reset()
      if (tightens(query.data, next)) setConfirm(next)
      else mutation.mutate(next)
    } catch (cause) {
      setError(messageOf(cause))
    }
  }
  const field = (key: keyof Draft, id: string, label: string, hint: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="decimal" step={key === "device" || key === "channel" ? "1" : "any"}
        min={key === "minutes" ? "1" : undefined} max={key === "minutes" ? "1440" : undefined}
        placeholder={key === "minutes" ? undefined : "不限"}
        required={key === "minutes"} value={draft?.[key] ?? ""}
        onChange={(event) => { setDraft((current) => current && { ...current, [key]: event.target.value }); setError(""); mutation.reset() }} />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
  return (
    <Page title="保留策略" description="仅清理服务器中的剪切板记录，设备本地历史由各客户端自行管理。">
      {query.isPending ? <LoadingState /> : query.error ? <ErrorState error={query.error} retry={() => query.refetch()} /> : (
        <section className="surface-raised max-w-2xl p-5 sm:p-6">
          <form className="space-y-6" onSubmit={submit}>
            <div className="grid gap-5 sm:grid-cols-2">
              {field("device", "retention-device", "每设备保留条数", "所有 Channel 合计，留空表示不限。")}
              {field("channel", "retention-channel", "每 Channel 保留条数", "该 Channel 内的所有设备合计，留空表示不限。")}
              {field("days", "retention-days", "最长保留时间（天）", "留空表示不过期，可输入小数。")}
              {field("minutes", "retention-minutes", "清理间隔（分钟）", "1 到 1440 分钟，仅在启用限制后生效。")}
            </div>
            {error || mutation.error ? <p role="alert" className="text-sm text-destructive">{error || messageOf(mutation.error)}</p> : null}
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "正在保存…" : "保存保留策略"}</Button>
          </form>
        </section>
      )}
      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清理服务器历史？</AlertDialogTitle>
            <AlertDialogDescription>保存后会立即清理超过新限制的服务端内容，此操作无法撤销。客户端本地历史不会被删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {mutation.error ? <p role="alert" className="text-sm text-destructive">{messageOf(mutation.error)}</p> : null}
            <AlertDialogCancel render={<Button variant="outline" />}>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={mutation.isPending}
              onClick={() => { if (confirm) mutation.mutate(confirm) }}>确认保存</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}
