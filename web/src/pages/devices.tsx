import { useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { KeyRoundIcon, PencilIcon, PlusIcon, PowerIcon, Trash2Icon } from "lucide-react"
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
  DialogTrigger,
} from "@/frame/components/ui/dialog"
import { Input } from "@/frame/components/ui/input"
import { Label } from "@/frame/components/ui/label"
import { Page } from "@/frame/layout"
import { formatDate, messageOf } from "@/utils/format"

const iconKinds = ["desktop", "laptop", "phone", "tablet", "server", "other"] as const

function DeviceFields({ id, tag, iconKind, setId, setTag, setIconKind, edit = false }: {
  readonly id: string
  readonly tag: string
  readonly iconKind: Device["iconKind"]
  readonly setId: (value: string) => void
  readonly setTag: (value: string) => void
  readonly setIconKind: (value: Device["iconKind"]) => void
  readonly edit?: boolean
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label htmlFor={edit ? `edit-id-${id}` : "new-device-id"}>DeviceId</Label>
        <Input
          id={edit ? `edit-id-${id}` : "new-device-id"}
          value={id}
          onChange={(event) => setId(event.target.value)}
          placeholder="xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
          disabled={edit}
          required
        />
        {!edit ? <p className="text-xs text-muted-foreground">填写插件生成的 UUID v4，服务器不会替换它。</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${edit ? "edit" : "new"}-device-tag`}>设备名称</Label>
        <Input id={`${edit ? "edit" : "new"}-device-tag`} value={tag} onChange={(event) => setTag(event.target.value)} maxLength={256} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${edit ? "edit" : "new"}-device-icon`}>图标类型</Label>
        <select
          id={`${edit ? "edit" : "new"}-device-icon`}
          className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm"
          value={iconKind}
          onChange={(event) => setIconKind(event.target.value as Device["iconKind"])}
        >
          {iconKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
        </select>
      </div>
    </div>
  )
}

function CreateDevice({ onCreated }: { readonly onCreated: () => void }) {
  const api = useApi()
  const [open, setOpen] = useState(false)
  const [id, setId] = useState("")
  const [tag, setTag] = useState("")
  const [iconKind, setIconKind] = useState<Device["iconKind"]>("laptop")
  const mutation = useMutation({
    mutationFn: () => api.createDevice({ id, tag, iconKind }),
    onSuccess: () => {
      onCreated()
      setOpen(false)
      setId("")
      setTag("")
      toast.success("设备已创建")
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate()
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}><PlusIcon className="size-4" />添加设备</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>添加设备</DialogTitle>
            <DialogDescription>批准一个由 Clipboard X 插件生成的设备身份。</DialogDescription>
          </DialogHeader>
          <DeviceFields {...{ id, tag, iconKind, setId, setTag, setIconKind }} />
          {mutation.error ? <p className="mb-4 text-sm text-destructive" role="alert">{messageOf(mutation.error)}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "创建中…" : "创建"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditDevice({ device, onSaved }: { readonly device: Device; readonly onSaved: () => void }) {
  const api = useApi()
  const [open, setOpen] = useState(false)
  const [tag, setTag] = useState(device.tag)
  const [iconKind, setIconKind] = useState(device.iconKind)
  const mutation = useMutation({
    mutationFn: () => api.updateDevice(device.id, { tag, iconKind }),
    onSuccess: () => {
      onSaved()
      setOpen(false)
      toast.success("设备资料已更新")
    },
  })
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`编辑 ${device.tag}`} />}>
        <PencilIcon className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(event) => { event.preventDefault(); mutation.mutate() }}>
          <DialogHeader><DialogTitle>编辑设备</DialogTitle><DialogDescription>DeviceId 创建后不可修改。</DialogDescription></DialogHeader>
          <DeviceFields id={device.id} setId={() => undefined} {...{ tag, iconKind, setTag, setIconKind }} edit />
          {mutation.error ? <p className="mb-4 text-sm text-destructive" role="alert">{messageOf(mutation.error)}</p> : null}
          <DialogFooter><Button type="submit" disabled={mutation.isPending}>保存</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function IssuedKeyDialog({ issued, clear }: { readonly issued?: IssuedDeviceKey; readonly clear: () => void }) {
  return (
    <Dialog open={Boolean(issued)} onOpenChange={(open) => { if (!open) clear() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>保存设备 API Key</DialogTitle>
          <DialogDescription>完整 Key 已写入 config.yaml；请复制到对应设备并妥善保护配置文件。</DialogDescription>
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

export function DevicesPage() {
  const api = useApi()
  const client = useQueryClient()
  const query = useQuery({ queryKey: ["devices"], queryFn: () => api.devices() })
  const [issued, setIssued] = useState<IssuedDeviceKey>()
  const refresh = () => client.invalidateQueries({ queryKey: ["devices"] })
  const update = useMutation({
    mutationFn: ({ device, disabled }: { device: Device; disabled: boolean }) => api.updateDevice(device.id, { disabled }),
    onSuccess: () => { refresh(); toast.success("设备状态已更新") },
    onError: (error) => toast.error(messageOf(error)),
  })
  const remove = useMutation({
    mutationFn: (device: Device) => api.deleteDevice(device.id),
    onSuccess: () => { refresh(); toast.success("设备已删除") },
    onError: (error) => toast.error(messageOf(error)),
  })
  const issue = useMutation({
    mutationFn: (device: Device) => api.issueDeviceKey(device.id),
    onSuccess: (value) => { setIssued(value); refresh() },
    onError: (error) => toast.error(messageOf(error)),
  })
  const revoke = useMutation({
    mutationFn: ({ deviceId, keyId }: { deviceId: string; keyId: string }) => api.revokeDeviceKey(deviceId, keyId),
    onSuccess: () => { refresh(); toast.success("API Key 已吊销") },
    onError: (error) => toast.error(messageOf(error)),
  })

  return (
    <Page
      title="设备"
      description="批准设备、维护友好资料，并管理每台设备独立的 API Key；变更会同步写入 config.yaml。"
      action={<CreateDevice onCreated={refresh} />}
    >
      {query.isPending ? <LoadingState /> : query.error ? <ErrorState error={query.error} retry={() => query.refetch()} />
        : query.data.length === 0 ? <EmptyState title="还没有设备" description="先添加插件生成的 DeviceId。" />
        : (
          <div className="grid gap-4 xl:grid-cols-2">
            {query.data.map((device) => (
              <section key={device.id} className="surface-raised p-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{device.tag}</h2>
                      <StatusBadge value={device.state} />
                    </div>
                    <code className="mt-1 block truncate text-xs text-muted-foreground">{device.id}</code>
                    <p className="mt-2 text-xs text-muted-foreground">最后在线：{formatDate(device.lastSeenAt)}</p>
                  </div>
                  <EditDevice device={device} onSaved={refresh} />
                </div>
                <div className="mt-5 border-t pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">API Keys</p>
                    <Button variant="outline" size="sm" disabled={Boolean(device.disabledAt) || issue.isPending} onClick={() => issue.mutate(device)}>
                      <KeyRoundIcon className="size-3.5" />签发/轮换
                    </Button>
                  </div>
                  {device.keys.length === 0 ? <p className="text-xs text-muted-foreground">尚未签发 Key</p> : (
                    <ul className="space-y-2">
                      {device.keys.map((key) => (
                        <li key={key.id} className="flex items-center gap-2 rounded-lg bg-muted/55 px-3 py-2 text-xs">
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
              </section>
            ))}
          </div>
        )}
      <IssuedKeyDialog {...(issued ? { issued } : {})} clear={() => setIssued(undefined)} />
    </Page>
  )
}
