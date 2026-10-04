import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { BanIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"
import { useRefresh } from "@/components/domain/use-refresh"
import { useApi, type Transfer } from "@/api"
import { ConfirmAction } from "@/components/domain/confirm-action"
import { EmptyState, ErrorState, LoadingState } from "@/components/domain/states"
import { StatusBadge } from "@/components/domain/status-badge"
import { Button } from "@/frame/components/ui/button"
import { Progress } from "@/frame/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/frame/components/ui/table"
import { Page } from "@/frame/layout"
import { errorMessage, formatBytes, formatDate, formatProgress, messageOf } from "@/utils/format"
import { usePreferences } from "@/stores/preferences"

const terminalStates = new Set(["completed", "failed", "cancelled", "expired"])

export function TransfersPage() {
  const { t } = useTranslation("management")
  usePreferences((state) => state.offsetMinutes)
  const api = useApi()
  const client = useQueryClient()
  const transfers = useQuery({
    queryKey: ["transfers"],
    queryFn: () => api.transfers(200),
    refetchInterval: (query) => query.state.data?.some((transfer) => !terminalStates.has(transfer.state)) ? 2_000 : 15_000,
  })
  const refresh = useRefresh(() => transfers.refetch(), "activity")
  const cancel = useMutation({
    mutationFn: (transfer: Transfer) => api.cancelTransfer(transfer.id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["transfers"] })
      client.invalidateQueries({ queryKey: ["overview"] })
      toast.success(t("transfers.cancelled"))
    },
    onError: (error) => toast.error(messageOf(error)),
  })

  return (
    <Page
      title={t("transfers.title")}
      description={t("transfers.description")}
      action={<Button variant="outline" onClick={refresh} disabled={transfers.isFetching}><RefreshCwIcon className={transfers.isFetching ? "animate-spin" : ""} />{t("common.refresh")}</Button>}
    >
      {transfers.isPending ? <LoadingState /> : transfers.error ? <ErrorState error={transfers.error} retry={() => transfers.refetch()} />
        : transfers.data.length === 0 ? <EmptyState title={t("transfers.emptyTitle")} description={t("transfers.emptyDescription")} />
        : (
          <div className="surface-raised overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow><TableHead>{t("transfers.type")}</TableHead><TableHead>{t("transfers.state")}</TableHead><TableHead>{t("transfers.progress")}</TableHead><TableHead>{t("transfers.device")}</TableHead><TableHead>{t("transfers.updatedAt")}</TableHead><TableHead className="text-right">{t("transfers.actions")}</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {transfers.data.map((transfer) => (
                  <TableRow key={transfer.id}>
                    <TableCell>
                      <p className="font-medium">{t("transfers.label", { kind: transfer.kind === "publish" ? t("transfers.publish") : t("transfers.content"), direction: transfer.direction === "upload" ? t("transfers.upload") : t("transfers.download") })}</p>
                      <code className="block max-w-44 truncate text-xs text-muted-foreground" title={transfer.itemId}>{transfer.itemId}</code>
                    </TableCell>
                    <TableCell><StatusBadge value={transfer.state} /></TableCell>
                    <TableCell className="min-w-48">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>{formatBytes(transfer.completedBytes)} / {formatBytes(transfer.totalBytes)}</span>
                        <span>{formatProgress(transfer.completedBytes, transfer.totalBytes)}</span>
                      </div>
                      <Progress value={transfer.totalBytes ? (transfer.completedBytes / transfer.totalBytes) * 100 : 0} />
                      {transfer.error.code || transfer.error.message ? <p className="mt-1 text-xs text-destructive">{errorMessage(transfer.error.code)}</p> : null}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{transfer.deviceId.slice(0, 8)}</code>
                      {transfer.peerDeviceIds.length ? <p className="text-xs text-muted-foreground">{t("transfers.peers", { count: transfer.peerDeviceIds.length })}</p> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(transfer.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      {!terminalStates.has(transfer.state) ? (
                        <ConfirmAction
                          trigger={<Button variant="ghost" size="icon-sm" aria-label={t("transfers.cancel")}><BanIcon className="size-4" /></Button>}
                          title={t("transfers.cancelTitle")}
                          description={t("transfers.cancelDescription")}
                          confirmLabel={t("transfers.cancel")}
                          pending={cancel.isPending}
                          onConfirm={() => cancel.mutate(transfer)}
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
    </Page>
  )
}
