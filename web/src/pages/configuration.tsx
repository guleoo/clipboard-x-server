import { useEffect, useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useApi, type CleanupConfiguration } from "@/api"
import { ErrorState, LoadingState } from "@/components/domain/states"
import { DisplayPreferences } from "@/components/domain/display-preferences"
import { Button } from "@/frame/components/ui/button"
import { Input } from "@/frame/components/ui/input"
import { Label } from "@/frame/components/ui/label"
import { Switch } from "@/frame/components/ui/switch"
import { Page } from "@/frame/layout"
import { LocalizedError } from "@/frame/common/error"
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
  fieldKey: string,
  options: { readonly optional?: boolean; readonly multiplier?: number; readonly min?: number; readonly max?: number } = {},
): number | undefined {
  if (value.trim() === "" && options.optional) return undefined
  const number = Number(value)
  const multiplier = options.multiplier ?? 1
  const result = number * multiplier
  if (!Number.isFinite(number) || number <= 0 || !Number.isSafeInteger(result)
    || result < (options.min ?? 1) || (options.max !== undefined && result > options.max)) {
    throw new LocalizedError("management:configuration.invalidNumber", { fieldKey })
  }
  return result
}

function configurationOf(draft: Draft): CleanupConfiguration {
  const maxItems = positiveNumber(draft.maxItems, "management:configuration.fields.maxItems", { optional: true })
  const maxItemsPerChannel = positiveNumber(draft.maxItemsPerChannel, "management:configuration.fields.maxItemsPerChannel", { optional: true })
  const maxItemsPerDevice = positiveNumber(draft.maxItemsPerDevice, "management:configuration.fields.maxItemsPerDevice", { optional: true })
  const maxItemsPerDevicePerChannel = positiveNumber(
    draft.maxItemsPerDevicePerChannel,
    "management:configuration.fields.maxItemsPerDevicePerChannel",
    { optional: true },
  )
  const maxAgeMillis = positiveNumber(draft.maxAgeDays, "management:configuration.fields.maxAge", {
    optional: true,
    multiplier: dayMillis,
  })
  return {
    enabled: draft.enabled,
    intervalMillis: positiveNumber(draft.intervalMinutes, "management:configuration.fields.interval", {
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
  const { t } = useTranslation("management")
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
        placeholder={optional ? t("configuration.unlimited") : undefined}
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
  const { t } = useTranslation("management")
  const api = useApi()
  const queryClient = useQueryClient()
  const queryKey = ["configuration", "cleanup"] as const
  const query = useQuery({ queryKey, queryFn: api.configuration.getCleanup })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<unknown>(null)
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
      setError(null)
      toast.success(t("configuration.saved"))
    },
  })
  function set<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => current && { ...current, [key]: value })
    setError(null)
    mutation.reset()
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || !query.data) return
    try {
      const next = configurationOf(draft)
      setError(null)
      mutation.reset()
      if (tightens(query.data, next)) setConfirm(next)
      else mutation.mutate(next)
    } catch (cause) {
      setError(cause)
    }
  }

  return (
    <Page title={t("configuration.title")} description={t("configuration.description")}>
      <DisplayPreferences />
      {query.isPending ? <LoadingState /> : query.error ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : draft ? (
        <form className="max-w-4xl space-y-5" onSubmit={submit}>
          <section className="surface-raised space-y-4 p-5 sm:p-6">
            <div>
              <h2 className="font-semibold">{t("configuration.policy")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("configuration.policyDescription")}</p>
            </div>
            <ToggleField
              id="cleanup-enabled"
              label={t("configuration.enabled")}
              description={t("configuration.enabledDescription")}
              checked={draft.enabled}
              onCheckedChange={(checked) => set("enabled", checked)}
            />
          </section>

          <section className="surface-raised space-y-4 p-5 sm:p-6">
            <div>
              <h2 className="font-semibold">{t("configuration.schedule")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("configuration.scheduleDescription")}
              </p>
            </div>
            <div className="max-w-sm">
              <NumberField id="cleanup-interval" label={t("configuration.fields.interval")}
                description={t("configuration.descriptions.interval")} value={draft.intervalMinutes}
                min={1} max={1440} step="any" onChange={(value) => set("intervalMinutes", value)} />
            </div>
          </section>

          <section className="surface-raised space-y-4 p-5 sm:p-6">
            <div>
              <h2 className="font-semibold">{t("configuration.items")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("configuration.itemsDescription")}</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <NumberField id="cleanup-total" label={t("configuration.fields.maxItems")} description={t("configuration.descriptions.maxItems")}
                optional value={draft.maxItems} onChange={(value) => set("maxItems", value)} />
              <NumberField id="cleanup-channel" label={t("configuration.fields.maxItemsPerChannel")} description={t("configuration.descriptions.maxItemsPerChannel")}
                optional value={draft.maxItemsPerChannel} onChange={(value) => set("maxItemsPerChannel", value)} />
              <NumberField id="cleanup-device" label={t("configuration.fields.maxItemsPerDevice")} description={t("configuration.descriptions.maxItemsPerDevice")}
                optional value={draft.maxItemsPerDevice} onChange={(value) => set("maxItemsPerDevice", value)} />
              <NumberField id="cleanup-device-channel" label={t("configuration.fields.maxItemsPerDevicePerChannel")}
                description={t("configuration.descriptions.maxItemsPerDevicePerChannel")} optional value={draft.maxItemsPerDevicePerChannel}
                onChange={(value) => set("maxItemsPerDevicePerChannel", value)} />
              <NumberField id="cleanup-age" label={t("configuration.fields.maxAge")} description={t("configuration.descriptions.maxAge")}
                optional step="any" value={draft.maxAgeDays} onChange={(value) => set("maxAgeDays", value)} />
            </div>
          </section>

          {error !== null || mutation.error ? (
            <p role="alert" className="text-sm text-destructive">{messageOf(error ?? mutation.error)}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t("configuration.saving") : t("configuration.save")}
            </Button>
          </div>
          {confirm ? (
            <section data-slot="cleanup-confirmation" role="group" aria-labelledby="cleanup-confirmation-title"
              className="surface-raised space-y-3 border-destructive/40 p-5">
              <div>
                <h2 id="cleanup-confirmation-title" className="font-semibold text-destructive">
                  {t("configuration.confirmTitle")}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {t("configuration.confirmDescription")}
                </p>
              </div>
              {mutation.error ? <p role="alert" className="text-sm text-destructive">{messageOf(mutation.error)}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setConfirm(null)}>{t("common.cancel")}</Button>
                <Button type="button" variant="destructive" disabled={mutation.isPending}
                  onClick={() => mutation.mutate(confirm)}>{t("configuration.confirmSave")}</Button>
              </div>
            </section>
          ) : null}
        </form>
      ) : null}
    </Page>
  )
}
