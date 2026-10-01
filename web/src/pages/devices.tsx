import { useEffect, useState, type CSSProperties, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { KeyRoundIcon, PlusIcon, PowerIcon, RotateCwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { useApi, type Device, type IssuedDeviceKey } from "@/api"
import { ConfirmAction } from "@/components/domain/confirm-action"
import { EmptyState, ErrorState, LoadingState } from "@/components/domain/states"
import { StatusBadge } from "@/components/domain/status-badge"
import { Button } from "@/frame/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frame/components/ui/dialog"
import { Input } from "@/frame/components/ui/input"
import { Label } from "@/frame/components/ui/label"
import { Page } from "@/frame/layout"
import { deviceName, formatDate, messageOf } from "@/utils/format"
import { usePreferences } from "@/stores/preferences"

const deviceIcons: Readonly<Record<string, string>> = {
  computer: "computer-symbolic.svg",
  laptop: "laptop-symbolic.svg",
  tablet: "tablet-symbolic.svg",
  server: "server-symbolic.svg",
  android: "android-fill-symbolic.svg",
  apple: "apple-fill-symbolic.svg",
  windows: "windows-fill-symbolic.svg",
  linux: "linux-symbolic.svg",
  debian: "debian-symbolic.svg",
  archlinux: "archlinux-symbolic.svg",
}

function darkIconColor(light: string): string {
  const channels = [1, 3, 5].map((index) => Number.parseInt(light.slice(index, index + 2), 16))
  const highest = Math.max(...channels)
  const scale = highest > 96 ? 96 / highest : 1
  return `#${channels.map((value) => Math.round(value * scale).toString(16).padStart(2, "0")).join("")}`
}

function DeviceHeading({ device }: { readonly device: Device }) {
  const { t } = useTranslation("management")
  const icon = Object.hasOwn(deviceIcons, device.iconKind)
    ? deviceIcons[device.iconKind]
    : deviceIcons.computer
  const colors = {
    "--device-icon-light": device.iconColor.dark ?? darkIconColor(device.iconColor.light),
    "--device-icon-dark": device.iconColor.light,
    maskImage: `url("/icons/device/${icon}")`,
    maskPosition: "center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
  } as CSSProperties

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="size-5 shrink-0 bg-[var(--device-icon-light)] dark:bg-[var(--device-icon-dark)]"
        style={colors} aria-hidden="true" />
      <h2 className="min-w-0 truncate font-semibold">{device.kind === "virtual" ? t("devices.virtualName") : deviceName(device)}</h2>
    </div>
  )
}

function IssuedKeyDialog({ issued, clear }: { readonly issued?: IssuedDeviceKey; readonly clear: () => void }) {
  const { t } = useTranslation("management")
  return (
    <Dialog open={Boolean(issued)} onOpenChange={(open) => { if (!open) clear() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("devices.saveKeyTitle")}</DialogTitle>
          <DialogDescription>
            {t("devices.saveKeyDescription")}
          </DialogDescription>
        </DialogHeader>
        <code className="block break-all rounded-lg border bg-muted p-3 text-xs select-all">{issued?.key}</code>
        <DialogFooter>
          <Button type="button" onClick={async () => {
            if (!issued) return
            try {
              await navigator.clipboard.writeText(issued.key)
              toast.success(t("devices.keyCopied"))
            } catch {
              toast.error(t("devices.keyCopyFailed"))
            }
          }}>{t("devices.copyKey")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateDeviceDialog({
  open,
  pending,
  onOpenChange,
  onCreate,
}: {
  readonly open: boolean
  readonly pending: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onCreate: (deviceId: string) => void
}) {
  const { t } = useTranslation("management")
  const [deviceId, setDeviceId] = useState("")
  useEffect(() => {
    if (!open) setDeviceId("")
  }, [open])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onCreate(deviceId.trim())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("devices.add")}</DialogTitle>
            <DialogDescription>
              {t("devices.createDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-5">
            <Label htmlFor="device-id">{t("devices.deviceId")}</Label>
            <Input
              id="device-id"
              className="mt-2 font-mono"
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              placeholder="00000000-0000-4000-8000-000000000000"
              autoComplete="off"
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={pending || !deviceId.trim()}>{pending ? t("devices.adding") : t("devices.add")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DevicesPage() {
  const { t } = useTranslation("management")
  usePreferences((state) => state.offsetMinutes)
  const api = useApi()
  const client = useQueryClient()
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api.devices() })
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<IssuedDeviceKey>()
  const refresh = () => client.invalidateQueries({ queryKey: ["devices"] })
  const create = useMutation({
    mutationFn: (deviceId: string) => api.createDevice(deviceId),
    onSuccess: () => { setCreating(false); void refresh(); toast.success(t("devices.added")) },
    onError: (error) => toast.error(messageOf(error)),
  })
  const update = useMutation({
    mutationFn: ({ device, disabled }: { device: Device; disabled: boolean }) => api.updateDevice(device.id, { disabled }),
    onSuccess: () => { void refresh(); toast.success(t("devices.updated")) },
    onError: (error) => toast.error(messageOf(error)),
  })
  const remove = useMutation({
    mutationFn: (device: Device) => api.deleteDevice(device.id),
    onSuccess: () => { void refresh(); toast.success(t("devices.deleted")) },
    onError: (error) => toast.error(messageOf(error)),
  })
  const issue = useMutation({
    mutationFn: (device: Device) => api.issueDeviceKey(device.id),
    onSuccess: (value) => { setIssued(value); void refresh() },
    onError: (error) => toast.error(messageOf(error)),
  })
  const revoke = useMutation({
    mutationFn: ({ deviceId, keyId }: { readonly deviceId: string; readonly keyId: string }) =>
      api.revokeDeviceKey(deviceId, keyId),
    onSuccess: () => { void refresh(); toast.success(t("devices.keyRevoked")) },
    onError: (error) => toast.error(messageOf(error)),
  })

  return (
    <Page
      title={t("devices.title")}
      description={t("devices.description")}
      action={(
        <Button onClick={() => setCreating(true)}>
          <PlusIcon className="size-4" />{t("devices.add")}
        </Button>
      )}
    >
      {devices.isPending ? <LoadingState /> : devices.error ? (
        <ErrorState error={devices.error} retry={() => { void devices.refetch() }} />
      ) : !devices.data || devices.data.length === 0 ? (
        <EmptyState title={t("devices.emptyTitle")} description={t("devices.emptyDescription")} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {devices.data.map((device) => (
            <section key={device.id} className="surface-raised p-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <DeviceHeading device={device} />
                    <StatusBadge value={device.state} />
                  </div>
                  <code className="mt-1 block truncate text-xs text-muted-foreground">{device.id}</code>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {device.kind === "client" ? t("devices.clientProfile") : t("devices.virtualProfile")} · {t("devices.lastSeen", { date: formatDate(device.lastSeenAt) })}
                  </p>
                </div>
              </div>
              {device.kind === "virtual" ? (
                <div className="mt-5 border-t pt-4 text-sm leading-6 text-muted-foreground">
                  {t("devices.virtualDescription")}
                </div>
              ) : <>
                <div className="mt-5 border-t pt-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">{t("devices.keys")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t("devices.keyNotice")}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={Boolean(device.disabledAt) || issue.isPending}
                      onClick={() => issue.mutate(device)}
                    >
                      {device.keys.some((key) => !key.revokedAt) ? <RotateCwIcon className="size-3.5" /> : <KeyRoundIcon className="size-3.5" />}
                      {device.keys.some((key) => !key.revokedAt) ? t("devices.rotate") : t("devices.issue")}
                    </Button>
                  </div>
                  {device.keys.length === 0 ? <p className="text-xs text-muted-foreground">{t("devices.noKeys")}</p> : (
                    <ul className="space-y-2">
                      {device.keys.map((key) => (
                        <li key={key.id} className="flex items-center gap-2 rounded-lg bg-muted/55 px-3 py-2 text-xs">
                          <span className="shrink-0 text-muted-foreground">{t("devices.keyId")}</span>
                          <code className="min-w-0 flex-1 truncate">{key.id}</code>
                          <span className="text-muted-foreground">{key.revokedAt ? t("devices.revoked") : key.expiresAt ? t("devices.overlap") : t("devices.current")}</span>
                          {!key.revokedAt ? (
                            <ConfirmAction
                              trigger={<Button variant="ghost" size="xs">{t("devices.revoke")}</Button>}
                              title={t("devices.revokeTitle")}
                              description={t("devices.revokeDescription")}
                              confirmLabel={t("devices.revoke")}
                              pending={revoke.isPending}
                              onConfirm={() => revoke.mutate({ deviceId: device.id, keyId: key.id })}
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-4">
                  <Button variant="outline" size="sm" onClick={() => update.mutate({ device, disabled: !device.disabledAt })}>
                    <PowerIcon className="size-3.5" />{device.disabledAt ? t("devices.enable") : t("devices.disable")}
                  </Button>
                  <ConfirmAction
                    trigger={<Button variant="destructive" size="sm"><Trash2Icon className="size-3.5" />{t("common.delete")}</Button>}
                    title={t("devices.deleteTitle", { name: deviceName(device) })}
                    description={t("devices.deleteDescription")}
                    confirmLabel={t("devices.deleteConfirm")}
                    pending={remove.isPending}
                    onConfirm={() => remove.mutate(device)}
                  />
                </div>
              </>}
            </section>
          ))}
        </div>
      )}
      <CreateDeviceDialog
        open={creating}
        pending={create.isPending}
        onOpenChange={setCreating}
        onCreate={(deviceId) => create.mutate(deviceId)}
      />
      <IssuedKeyDialog {...(issued ? { issued } : {})} clear={() => setIssued(undefined)} />
    </Page>
  )
}
