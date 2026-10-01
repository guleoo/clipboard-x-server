import { useEffect, useState, type ReactElement } from "react"
import { useTranslation } from "react-i18next"
import { useMutation } from "@tanstack/react-query"
import { ServerIcon } from "lucide-react"
import { toast } from "sonner"
import { useApi, type Channel, type Device } from "@/api"
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
import { messageOf } from "@/utils/format"

export function ChannelEditor({ channel, devices, trigger, saved }: {
  readonly channel?: Channel
  readonly devices: readonly Device[]
  readonly trigger: ReactElement
  readonly saved: (channelId: string) => void
}) {
  const { t } = useTranslation("clipboard")
  const api = useApi()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(channel?.name ?? "")
  const [members, setMembers] = useState<ReadonlySet<string>>(new Set())
  const clients = devices.filter((device) => device.kind === "client")
  useEffect(() => {
    if (!open) return
    setName(channel?.name ?? "")
    setMembers(new Set(channel?.members.filter((member) => member.kind === "client").map((member) => member.id)))
  }, [channel, open])
  const mutation = useMutation({
    mutationFn: async () => {
      const savedChannel = channel
        ? await api.updateChannel(channel.id, name.trim())
        : await api.createChannel(name.trim())
      const previous = new Set(channel?.members.filter((member) => member.kind === "client").map((member) => member.id))
      const additions = [...members].filter((id) => !previous.has(id))
      const removals = [...previous].filter((id) => !members.has(id))
      await Promise.all([
        ...additions.map((id) => api.addChannelMember(savedChannel.id, id)),
        ...removals.map((id) => api.removeChannelMember(savedChannel.id, id)),
      ])
      return savedChannel.id
    },
    onSuccess: (channelId) => {
      setOpen(false)
      saved(channelId)
      toast.success(t(channel ? "channelUpdated" : "channelCreated"))
    },
  })
  const toggle = (deviceId: string, checked: boolean) => {
    setMembers((current) => {
      const next = new Set(current)
      if (checked) next.add(deviceId)
      else next.delete(deviceId)
      return next
    })
  }
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!mutation.isPending) setOpen(value) }}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => { event.preventDefault(); mutation.mutate() }}>
          <DialogHeader>
            <DialogTitle>{channel ? t("editChannel") : t("createChannel")}</DialogTitle>
            <DialogDescription className="sr-only">{t("channelDetails")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-5">
            <div className="space-y-1.5">
              <Label htmlFor={`channel-name-${channel?.id ?? "new"}`}>{t("name")}</Label>
              <Input
                id={`channel-name-${channel?.id ?? "new"}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={256}
                required
                autoFocus
              />
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">{t("syncDevices")}</legend>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-1.5">
                <div className="flex min-h-10 items-center gap-3 rounded-md bg-muted/55 px-3 py-2">
                  <ServerIcon className="size-4 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">Clipboard X Server</span>
                  <span className="text-xs text-muted-foreground">{t("fixed")}</span>
                </div>
                {clients.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">{t("noDevices")}</p>
                ) : clients.map((device) => (
                  <label key={device.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/55">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={members.has(device.id)}
                      onChange={(event) => toggle(device.id, event.target.checked)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{device.tag}</span>
                    <span className="text-xs text-muted-foreground">{t(device.disabledAt ? "disabled" : device.state === "online" ? "online" : "offline")}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          {mutation.error ? <p className="mb-4 text-sm text-destructive" role="alert">{messageOf(mutation.error)}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || mutation.isPending}>
              {mutation.isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
