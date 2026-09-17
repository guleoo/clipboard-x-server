import { useEffect, useState, type CSSProperties, type FormEvent } from "react"
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
import { formatDate, messageOf } from "@/utils/format"

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
      <h2 className="min-w-0 truncate font-semibold">{device.tag}</h2>
    </div>
  )
}

function IssuedKeyDialog({ issued, clear }: { readonly issued?: IssuedDeviceKey; readonly clear: () => void }) {
  return (
    <Dialog open={Boolean(issued)} onOpenChange={(open) => { if (!open) clear() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>保存设备 API Key</DialogTitle>
          <DialogDescription>
            此 Key 已绑定到对应的 DeviceId。请把完整 Key 配置到该 Clipboard X 客户端，客户端连接后会同步名称和图标。
          </DialogDescription>
        </DialogHeader>
        <code className="block break-all rounded-lg border bg-muted p-3 text-xs select-all">{issued?.key}</code>
        <DialogFooter>
          <Button type="button" onClick={async () => {
            if (issued) await navigator.clipboard.writeText(issued.key)
            toast.success("API Key 已复制")
          }}>复制 Key</Button>
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
            <DialogTitle>添加设备</DialogTitle>
            <DialogDescription>
              输入客户端生成的 DeviceId。设备名称和图标会在客户端连接后自动同步。
            </DialogDescription>
          </DialogHeader>
          <div className="py-5">
            <Label htmlFor="device-id">DeviceId</Label>
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={pending || !deviceId.trim()}>{pending ? "添加中…" : "添加设备"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DevicesPage() {
  const api = useApi()
  const client = useQueryClient()
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api.devices() })
  const [creating, setCreating] = useState(false)
  const [issued, setIssued] = useState<IssuedDeviceKey>()
  const refresh = () => client.invalidateQueries({ queryKey: ["devices"] })
  const create = useMutation({
    mutationFn: (deviceId: string) => api.createDevice(deviceId),
    onSuccess: () => { setCreating(false); void refresh(); toast.success("设备已添加") },
    onError: (error) => toast.error(messageOf(error)),
  })
  const update = useMutation({
    mutationFn: ({ device, disabled }: { device: Device; disabled: boolean }) => api.updateDevice(device.id, { disabled }),
    onSuccess: () => { void refresh(); toast.success("设备状态已更新") },
    onError: (error) => toast.error(messageOf(error)),
  })
  const remove = useMutation({
    mutationFn: (device: Device) => api.deleteDevice(device.id),
    onSuccess: () => { void refresh(); toast.success("设备已删除") },
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
    onSuccess: () => { void refresh(); toast.success("API Key 已吊销") },
    onError: (error) => toast.error(messageOf(error)),
  })

  return (
    <Page
      title="设备"
      description="先登记客户端生成的 DeviceId，再签发绑定 Key；设备名称和图标由客户端维护并同步。"
      action={(
        <Button onClick={() => setCreating(true)}>
          <PlusIcon className="size-4" />添加设备
        </Button>
      )}
    >
      {devices.isPending ? <LoadingState /> : devices.error ? (
        <ErrorState error={devices.error} retry={() => { void devices.refetch() }} />
      ) : !devices.data || devices.data.length === 0 ? (
        <EmptyState title="还没有设备" description="添加客户端 DeviceId 后，再为它签发访问 Key。" />
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
                    {device.kind === "client" ? "客户端同步资料" : "服务器虚拟设备"} · 最后在线 {formatDate(device.lastSeenAt)}
                  </p>
                </div>
              </div>
              {device.kind === "virtual" ? (
                <div className="mt-5 border-t pt-4 text-sm leading-6 text-muted-foreground">
                  这是服务器在所有 Channel 中的固定身份，只发送从 Web 添加的内容，不接收其他设备的剪切板内容。
                </div>
              ) : <>
                <div className="mt-5 border-t pt-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">API Keys</p>
                      <p className="mt-1 text-xs text-muted-foreground">新 Key 只会在签发后显示一次。</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={Boolean(device.disabledAt) || issue.isPending}
                      onClick={() => issue.mutate(device)}
                    >
                      {device.keys.some((key) => !key.revokedAt) ? <RotateCwIcon className="size-3.5" /> : <KeyRoundIcon className="size-3.5" />}
                      {device.keys.some((key) => !key.revokedAt) ? "轮换 Key" : "签发 Key"}
                    </Button>
                  </div>
                  {device.keys.length === 0 ? <p className="text-xs text-muted-foreground">当前没有 Key</p> : (
                    <ul className="space-y-2">
                      {device.keys.map((key) => (
                        <li key={key.id} className="flex items-center gap-2 rounded-lg bg-muted/55 px-3 py-2 text-xs">
                          <span className="shrink-0 text-muted-foreground">Key ID</span>
                          <code className="min-w-0 flex-1 truncate">{key.id}</code>
                          <span className="text-muted-foreground">{key.revokedAt ? "已吊销" : key.expiresAt ? "重叠期" : "当前"}</span>
                          {!key.revokedAt ? (
                            <ConfirmAction
                              trigger={<Button variant="ghost" size="xs">吊销</Button>}
                              title="吊销此 API Key？"
                              description="使用此 Key 的设备会立即失去访问权限。"
                              confirmLabel="吊销"
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
                    <PowerIcon className="size-3.5" />{device.disabledAt ? "启用" : "禁用"}
                  </Button>
                  <ConfirmAction
                    trigger={<Button variant="destructive" size="sm"><Trash2Icon className="size-3.5" />删除</Button>}
                    title={`删除设备“${device.tag}”？`}
                    description="设备将被归档，所有 Key 会被吊销，并从全部 Channel 移除。历史条目的来源信息会保留。"
                    confirmLabel="删除设备"
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
