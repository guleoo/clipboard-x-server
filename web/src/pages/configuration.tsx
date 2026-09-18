import { useEffect, useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useApi, type CleanupConfiguration } from "@/api"
import { ErrorState, LoadingState } from "@/components/domain/states"
import { Button } from "@/frame/components/ui/button"
import { Input } from "@/frame/components/ui/input"
import { Label } from "@/frame/components/ui/label"
import { Switch } from "@/frame/components/ui/switch"
import { Page } from "@/frame/layout"
import { messageOf } from "@/utils/format"

interface Draft {
  enabled: boolean
  intervalMinutes: string
  maxItems: string
  maxItemsPerChannel: string
  maxItemsPerDevice: string
  maxItemsPerDevicePerChannel: string
  maxAgeDays: string
}

const minuteMillis = 60_000
const dayMillis = 86_400_000

function draftOf(value: CleanupConfiguration): Draft {
  return {
    enabled: value.enabled,
    intervalMinutes: String(value.intervalMillis / minuteMillis),
    maxItems: value.clipboard.maxItems?.toString() ?? "",
    maxItemsPerChannel: value.clipboard.maxItemsPerChannel?.toString() ?? "",
    maxItemsPerDevice: value.clipboard.maxItemsPerDevice?.toString() ?? "",
    maxItemsPerDevicePerChannel: value.clipboard.maxItemsPerDevicePerChannel?.toString() ?? "",
    maxAgeDays: value.clipboard.maxAgeMillis === undefined ? "" : String(value.clipboard.maxAgeMillis / dayMillis),
  }
}

function positiveNumber(
  value: string,
  label: string,
  options: { readonly optional?: boolean; readonly multiplier?: number; readonly min?: number; readonly max?: number } = {},
): number | undefined {
  if (value.trim() === "" && options.optional) return undefined
  const number = Number(value)
  const multiplier = options.multiplier ?? 1
  const result = number * multiplier
  if (!Number.isFinite(number) || number <= 0 || !Number.isSafeInteger(result)
    || result < (options.min ?? 1) || (options.max !== undefined && result > options.max)) {
    throw new Error(`${label}超出允许范围`)
  }
  return result
}

function configurationOf(draft: Draft): CleanupConfiguration {
  const maxItems = positiveNumber(draft.maxItems, "服务端总保留条数", { optional: true })
  const maxItemsPerChannel = positiveNumber(draft.maxItemsPerChannel, "每 Channel 保留条数", { optional: true })
  const maxItemsPerDevice = positiveNumber(draft.maxItemsPerDevice, "每设备保留条数", { optional: true })
  const maxItemsPerDevicePerChannel = positiveNumber(
    draft.maxItemsPerDevicePerChannel,
    "每设备在每 Channel 的保留条数",
    { optional: true },
  )
  const maxAgeMillis = positiveNumber(draft.maxAgeDays, "最长保留时间", {
    optional: true,
    multiplier: dayMillis,
  })
  return {
    enabled: draft.enabled,
    intervalMillis: positiveNumber(draft.intervalMinutes, "周期清理间隔", {
      multiplier: minuteMillis,
      min: minuteMillis,
      max: dayMillis,
    })!,
    clipboard: {
      ...(maxItems === undefined ? {} : { maxItems }),
      ...(maxItemsPerChannel === undefined ? {} : { maxItemsPerChannel }),
      ...(maxItemsPerDevice === undefined ? {} : { maxItemsPerDevice }),
      ...(maxItemsPerDevicePerChannel === undefined ? {} : { maxItemsPerDevicePerChannel }),
      ...(maxAgeMillis === undefined ? {} : { maxAgeMillis }),
    },
  }
}

function tightens(previous: CleanupConfiguration, next: CleanupConfiguration): boolean {
  if (!next.enabled) return false
  const clipboardFields = [
    "maxItems",
    "maxItemsPerChannel",
    "maxItemsPerDevice",
    "maxItemsPerDevicePerChannel",
    "maxAgeMillis",
  ] as const
  if (!previous.enabled) return next.enabled
  return clipboardFields.some((field) =>
    (next.clipboard[field] ?? Infinity) < (previous.clipboard[field] ?? Infinity))
}

interface ToggleFieldProps {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly checked: boolean
  readonly disabled?: boolean
  readonly onCheckedChange: (checked: boolean) => void
}

function ToggleField({ id, label, description, checked, disabled, onCheckedChange }: ToggleFieldProps) {
  return (
    <div className="flex items-start justify-between gap-5 rounded-lg border border-border p-3.5">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  )
}

interface NumberFieldProps {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly value: string
  readonly optional?: boolean
  readonly disabled?: boolean
  readonly min?: number
  readonly max?: number
  readonly step?: string
  readonly onChange: (value: string) => void
}

function NumberField({
  id, label, description, value, optional, disabled, min = 0.000001, max, step = "1", onChange,
}: NumberFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        placeholder={optional ? "不限" : undefined}
        required={!optional}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

export function ConfigurationPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const queryKey = ["configuration", "cleanup"] as const
  const query = useQuery({ queryKey, queryFn: api.configuration.getCleanup })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState("")
  const [confirm, setConfirm] = useState<CleanupConfiguration | null>(null)
  useEffect(() => {
    if (query.data) setDraft((current) => current ?? draftOf(query.data))
  }, [query.data])
  const mutation = useMutation({
    mutationFn: api.configuration.updateCleanup,
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved)
      setDraft(draftOf(saved))
      setConfirm(null)
      setError("")
      toast.success("清理策略已更新")
    },
  })
  function set<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => current && { ...current, [key]: value })
    setError("")
    mutation.reset()
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || !query.data) return
    try {
      const next = configurationOf(draft)
      setError("")
      mutation.reset()
      if (tightens(query.data, next)) setConfirm(next)
      else mutation.mutate(next)
    } catch (cause) {
      setError(messageOf(cause))
    }
  }

  return (
    <Page title="配置" description="集中管理服务端行为；当前仅开放清理策略。">
      {query.isPending ? <LoadingState /> : query.error ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : draft ? (
        <form className="max-w-4xl space-y-5" onSubmit={submit}>
          <section className="surface-raised space-y-4 p-5 sm:p-6">
            <div>
              <h2 className="font-semibold">清理策略</h2>
              <p className="mt-1 text-sm text-muted-foreground">只清理服务器副本，不影响任何客户端的本地历史。</p>
            </div>
            <ToggleField
              id="cleanup-enabled"
              label="启用自动清理"
              description="开启后，服务器只会按照设定周期在后台清理；关闭时保留下面的规则。"
              checked={draft.enabled}
              onCheckedChange={(checked) => set("enabled", checked)}
            />
          </section>

          <section className="surface-raised space-y-4 p-5 sm:p-6">
            <div>
              <h2 className="font-semibold">清理周期</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                周期任务采用内部固定的小批次执行，并在批次之间让出处理时间。
              </p>
            </div>
            <div className="max-w-sm">
              <NumberField id="cleanup-interval" label="周期清理间隔（分钟）"
                description="1 到 1440 分钟；修改配置不会立即触发清理。" value={draft.intervalMinutes}
                min={1} max={1440} step="any" onChange={(value) => set("intervalMinutes", value)} />
            </div>
          </section>

          <section className="surface-raised space-y-4 p-5 sm:p-6">
            <div>
              <h2 className="font-semibold">剪切板条目</h2>
              <p className="mt-1 text-sm text-muted-foreground">多个限制同时存在时，命中任意一个的最旧条目就会成为候选。</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField id="cleanup-total" label="服务端总保留条数" description="所有 Channel 与设备合计。"
                optional value={draft.maxItems} onChange={(value) => set("maxItems", value)} />
              <NumberField id="cleanup-channel" label="每 Channel 保留条数" description="一个 Channel 内所有设备合计。"
                optional value={draft.maxItemsPerChannel} onChange={(value) => set("maxItemsPerChannel", value)} />
              <NumberField id="cleanup-device" label="每设备保留条数" description="一个设备跨所有 Channel 合计。"
                optional value={draft.maxItemsPerDevice} onChange={(value) => set("maxItemsPerDevice", value)} />
              <NumberField id="cleanup-device-channel" label="每设备在每 Channel 保留条数"
                description="限制设备与 Channel 的交叉范围。" optional value={draft.maxItemsPerDevicePerChannel}
                onChange={(value) => set("maxItemsPerDevicePerChannel", value)} />
              <NumberField id="cleanup-age" label="最长保留时间（天）" description="按条目创建时间计算，可输入小数。"
                optional step="any" value={draft.maxAgeDays} onChange={(value) => set("maxAgeDays", value)} />
            </div>
          </section>

          {error || mutation.error ? (
            <p role="alert" className="text-sm text-destructive">{error || messageOf(mutation.error)}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "正在保存…" : "保存清理策略"}
            </Button>
          </div>
          {confirm ? (
            <section data-slot="cleanup-confirmation" role="group" aria-labelledby="cleanup-confirmation-title"
              className="surface-raised space-y-3 border-destructive/40 p-5">
              <div>
                <h2 id="cleanup-confirmation-title" className="font-semibold text-destructive">
                  确认应用更严格的清理策略？
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  保存后将从下一个清理周期开始应用。任务会在后台分批处理；已清理的服务器内容无法恢复，客户端本地历史不会被删除。
                </p>
              </div>
              {mutation.error ? <p role="alert" className="text-sm text-destructive">{messageOf(mutation.error)}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setConfirm(null)}>取消</Button>
                <Button type="button" variant="destructive" disabled={mutation.isPending}
                  onClick={() => mutation.mutate(confirm)}>确认保存</Button>
              </div>
            </section>
          ) : null}
        </form>
      ) : null}
    </Page>
  )
}
