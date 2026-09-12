import { useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PencilIcon, PlusIcon, Trash2Icon, UserMinusIcon, UserPlusIcon } from "lucide-react"
import { toast } from "sonner"
import { useApi, type Channel, type Device } from "@/api"
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
import { messageOf } from "@/utils/format"

function ChannelDialog({ channel, saved }: { readonly channel?: Channel; readonly saved: () => void }) {
  const api = useApi()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(channel?.name ?? "")
  const mutation = useMutation({
    mutationFn: () => channel ? api.updateChannel(channel.id, name) : api.createChannel(name),
    onSuccess: () => {
      saved()
      setOpen(false)
      if (!channel) setName("")
      toast.success(channel ? "Channel 已更新" : "Channel 已创建")
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate()
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={channel
        ? <Button variant="ghost" size="icon-sm" aria-label={`编辑 ${channel.name}`} />
        : <Button />}>
        {channel ? <PencilIcon className="size-4" /> : <><PlusIcon className="size-4" />创建 Channel</>}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{channel ? "重命名 Channel" : "创建 Channel"}</DialogTitle>
            <DialogDescription>设备只有加入 Channel 后才能读取或发布其中的条目。</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-5">
            <Label htmlFor={`channel-name-${channel?.id ?? "new"}`}>名称</Label>
            <Input id={`channel-name-${channel?.id ?? "new"}`} value={name} onChange={(event) => setName(event.target.value)} maxLength={256} required autoFocus />
          </div>
          {mutation.error ? <p className="mb-4 text-sm text-destructive" role="alert">{messageOf(mutation.error)}</p> : null}
          <DialogFooter><Button type="submit" disabled={mutation.isPending}>保存</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddMember({ channel, devices, saved }: {
  readonly channel: Channel
  readonly devices: readonly Device[]
  readonly saved: () => void
}) {
  const api = useApi()
  const available = devices.filter((device) => !device.disabledAt && !channel.members.some((member) => member.id === device.id))
  const [deviceId, setDeviceId] = useState("")
  const mutation = useMutation({
    mutationFn: () => api.addChannelMember(channel.id, deviceId),
    onSuccess: () => { saved(); setDeviceId(""); toast.success("设备已加入 Channel") },
    onError: (error) => toast.error(messageOf(error)),
  })
  if (available.length === 0) return null
  return (
    <div className="mt-4 flex gap-2 border-t pt-4">
      <label className="sr-only" htmlFor={`member-${channel.id}`}>选择要加入 {channel.name} 的设备</label>
      <select
        id={`member-${channel.id}`}
        className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-sm"
        value={deviceId}
        onChange={(event) => setDeviceId(event.target.value)}
      >
        <option value="">选择设备…</option>
        {available.map((device) => <option key={device.id} value={device.id}>{device.tag}</option>)}
      </select>
      <Button variant="outline" size="sm" disabled={!deviceId || mutation.isPending} onClick={() => mutation.mutate()}>
        <UserPlusIcon className="size-3.5" />加入
      </Button>
    </div>
  )
}

export function ChannelsPage() {
  const api = useApi()
  const client = useQueryClient()
  const channels = useQuery({ queryKey: ["channels"], queryFn: () => api.channels() })
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api.devices() })
  const refresh = () => client.invalidateQueries({ queryKey: ["channels"] })
  const removeChannel = useMutation({
    mutationFn: (channel: Channel) => api.deleteChannel(channel.id),
    onSuccess: () => { refresh(); toast.success("Channel 已删除") },
    onError: (error) => toast.error(messageOf(error)),
  })
  const removeMember = useMutation({
    mutationFn: ({ channelId, deviceId }: { channelId: string; deviceId: string }) => api.removeChannelMember(channelId, deviceId),
    onSuccess: () => { refresh(); toast.success("设备已移出 Channel") },
    onError: (error) => toast.error(messageOf(error)),
  })
  const pending = channels.isPending || devices.isPending
  const error = channels.error ?? devices.error
  return (
    <Page
      title="Channel"
      description="Channel 是同步隔离边界；一条剪切板记录只属于一个 Channel，变更会同步写入 config.yaml。"
      action={<ChannelDialog saved={refresh} />}
    >
      {pending ? <LoadingState /> : error ? <ErrorState error={error} retry={() => { channels.refetch(); devices.refetch() }} />
        : channels.data?.length === 0 ? <EmptyState title="还没有 Channel" description="创建 Channel，然后把设备加入其中。" />
        : (
          <div className="grid gap-4 xl:grid-cols-2">
            {channels.data?.map((channel) => (
              <section key={channel.id} className="surface-raised p-5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">{channel.name}</h2>
                    <code className="mt-1 block truncate text-xs text-muted-foreground">{channel.id}</code>
                  </div>
                  <ChannelDialog channel={channel} saved={refresh} />
                  <ConfirmAction
                    trigger={<Button variant="ghost" size="icon-sm" aria-label={`删除 ${channel.name}`}><Trash2Icon className="size-4 text-destructive" /></Button>}
                    title={`删除 Channel“${channel.name}”？`}
                    description="设备会立即失去此 Channel 的访问权限。已存储条目仍保留，等待后续显式清理。"
                    confirmLabel="删除 Channel"
                    pending={removeChannel.isPending}
                    onConfirm={() => removeChannel.mutate(channel)}
                  />
                </div>
                <div className="mt-5">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">成员（{channel.members.length}）</p>
                  {channel.members.length === 0 ? <p className="rounded-lg bg-muted/55 p-3 text-sm text-muted-foreground">暂无成员</p> : (
                    <ul className="space-y-2">
                      {channel.members.map((member) => (
                        <li key={member.id} className="flex items-center gap-2 rounded-lg bg-muted/55 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate font-medium">{member.tag}</span>
                          <StatusBadge value={member.state} />
                          <ConfirmAction
                            trigger={<Button variant="ghost" size="icon-xs" aria-label={`移出 ${member.tag}`}><UserMinusIcon className="size-3.5" /></Button>}
                            title={`将“${member.tag}”移出 Channel？`}
                            description="该设备将无法继续读取或发布此 Channel 的条目。"
                            confirmLabel="移出"
                            pending={removeMember.isPending}
                            onConfirm={() => removeMember.mutate({ channelId: channel.id, deviceId: member.id })}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <AddMember channel={channel} devices={devices.data ?? []} saved={refresh} />
              </section>
            ))}
          </div>
        )}
    </Page>
  )
}
