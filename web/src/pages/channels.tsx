import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation("clipboard")
  const api = useApi()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(channel?.name ?? "")
  const mutation = useMutation({
    mutationFn: () => channel ? api.updateChannel(channel.id, name) : api.createChannel(name),
    onSuccess: () => {
      saved()
      setOpen(false)
      if (!channel) setName("")
      toast.success(t(channel ? "channelUpdated" : "channelCreated"))
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate()
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={channel
        ? <Button variant="ghost" size="icon-sm" aria-label={t("editNamedChannel", { name: channel.name })} />
        : <Button />}>
        {channel ? <PencilIcon className="size-4" /> : <><PlusIcon className="size-4" />{t("createChannel")}</>}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t(channel ? "renameChannel" : "createChannel")}</DialogTitle>
            <DialogDescription>{t("channelAccessDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-5">
            <Label htmlFor={`channel-name-${channel?.id ?? "new"}`}>{t("name")}</Label>
            <Input id={`channel-name-${channel?.id ?? "new"}`} value={name} onChange={(event) => setName(event.target.value)} maxLength={256} required autoFocus />
          </div>
          {mutation.error ? <p className="mb-4 text-sm text-destructive" role="alert">{messageOf(mutation.error)}</p> : null}
          <DialogFooter><Button type="submit" disabled={mutation.isPending}>{t("save")}</Button></DialogFooter>
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
  const { t } = useTranslation("clipboard")
  const api = useApi()
  const available = devices.filter((device) => !device.disabledAt && !channel.members.some((member) => member.id === device.id))
  const [deviceId, setDeviceId] = useState("")
  const mutation = useMutation({
    mutationFn: () => api.addChannelMember(channel.id, deviceId),
    onSuccess: () => { saved(); setDeviceId(""); toast.success(t("memberAdded")) },
    onError: (error) => toast.error(messageOf(error)),
  })
  if (available.length === 0) return null
  return (
    <div className="mt-4 flex gap-2 border-t pt-4">
      <label className="sr-only" htmlFor={`member-${channel.id}`}>{t("selectMember", { name: channel.name })}</label>
      <select
        id={`member-${channel.id}`}
        className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-sm"
        value={deviceId}
        onChange={(event) => setDeviceId(event.target.value)}
      >
        <option value="">{t("selectDevice")}</option>
        {available.map((device) => <option key={device.id} value={device.id}>{device.tag}</option>)}
      </select>
      <Button variant="outline" size="sm" disabled={!deviceId || mutation.isPending} onClick={() => mutation.mutate()}>
        <UserPlusIcon className="size-3.5" />{t("join")}
      </Button>
    </div>
  )
}

export function ChannelsPage() {
  const { t } = useTranslation("clipboard")
  const api = useApi()
  const client = useQueryClient()
  const channels = useQuery({ queryKey: ["channels"], queryFn: () => api.channels() })
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api.devices() })
  const refresh = () => client.invalidateQueries({ queryKey: ["channels"] })
  const removeChannel = useMutation({
    mutationFn: (channel: Channel) => api.deleteChannel(channel.id),
    onSuccess: () => { refresh(); toast.success(t("channelDeleted")) },
    onError: (error) => toast.error(messageOf(error)),
  })
  const removeMember = useMutation({
    mutationFn: ({ channelId, deviceId }: { channelId: string; deviceId: string }) => api.removeChannelMember(channelId, deviceId),
    onSuccess: () => { refresh(); toast.success(t("memberRemoved")) },
    onError: (error) => toast.error(messageOf(error)),
  })
  const pending = channels.isPending || devices.isPending
  const error = channels.error ?? devices.error
  return (
    <Page
      title={t("channels")}
      description={t("channelsDescription")}
      action={<ChannelDialog saved={refresh} />}
    >
      {pending ? <LoadingState /> : error ? <ErrorState error={error} retry={() => { channels.refetch(); devices.refetch() }} />
        : channels.data?.length === 0 ? <EmptyState title={t("noChannels")} description={t("noChannelsDescription")} />
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
                    trigger={<Button variant="ghost" size="icon-sm" aria-label={t("deleteNamedChannelAction", { name: channel.name })}><Trash2Icon className="size-4 text-destructive" /></Button>}
                    title={t("deleteNamedChannel", { name: channel.name })}
                    description={t("deleteLegacyChannelDescription")}
                    confirmLabel={t("deleteChannel")}
                    pending={removeChannel.isPending}
                    onConfirm={() => removeChannel.mutate(channel)}
                  />
                </div>
                <div className="mt-5">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{t("members", { count: channel.members.length })}</p>
                  {channel.members.length === 0 ? <p className="rounded-lg bg-muted/55 p-3 text-sm text-muted-foreground">{t("noMembers")}</p> : (
                    <ul className="space-y-2">
                      {channel.members.map((member) => (
                        <li key={member.id} className="flex items-center gap-2 rounded-lg bg-muted/55 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate font-medium">{member.tag}</span>
                          <StatusBadge value={member.state} />
                          <ConfirmAction
                            trigger={<Button variant="ghost" size="icon-xs" aria-label={t("removeNamedMember", { name: member.tag })}><UserMinusIcon className="size-3.5" /></Button>}
                            title={t("removeMemberTitle", { name: member.tag })}
                            description={t("removeMemberDescription")}
                            confirmLabel={t("remove")}
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
