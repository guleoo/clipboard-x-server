import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { BanIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"
import { useApi, type Transfer } from "@/api"
import { ConfirmAction } from "@/components/domain/confirm-action"
import { EmptyState, ErrorState, LoadingState } from "@/components/domain/states"
import { StatusBadge } from "@/components/domain/status-badge"
import { Button } from "@/frame/components/ui/button"
import { Progress } from "@/frame/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/frame/components/ui/table"
import { Page } from "@/frame/layout"
import { formatBytes, formatDate, formatProgress, messageOf } from "@/utils/format"

const terminalStates = new Set(["completed", "failed", "cancelled", "expired"])

function transferLabel(transfer: Transfer): string {
  const kind = transfer.kind === "publish" ? "发布" : "内容物化"
  const direction = transfer.direction === "upload" ? "上传" : "下载"
  return `${kind} · ${direction}`
}

export function TransfersPage() {
  const api = useApi()
  const client = useQueryClient()
  const transfers = useQuery({
    queryKey: ["transfers"],
    queryFn: () => api.transfers(200),
    refetchInterval: (query) => query.state.data?.some((transfer) => !terminalStates.has(transfer.state)) ? 2_000 : 15_000,
  })
  const cancel = useMutation({
    mutationFn: (transfer: Transfer) => api.cancelTransfer(transfer.id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["transfers"] })
      client.invalidateQueries({ queryKey: ["overview"] })
      toast.success("已取消传输")
    },
    onError: (error) => toast.error(messageOf(error)),
  })

  return (
    <Page
      title="传输"
      description="查看发布与按需内容物化的进度、参与设备和失败原因。"
      action={<Button variant="outline" onClick={() => transfers.refetch()} disabled={transfers.isFetching}><RefreshCwIcon className={transfers.isFetching ? "animate-spin" : ""} />刷新</Button>}
    >
      {transfers.isPending ? <LoadingState /> : transfers.error ? <ErrorState error={transfers.error} retry={() => transfers.refetch()} />
        : transfers.data.length === 0 ? <EmptyState title="还没有传输" description="设备发布剪切板或请求按需内容后，会在这里显示进度。" />
        : (
          <div className="surface-raised overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow><TableHead>类型</TableHead><TableHead>状态</TableHead><TableHead>进度</TableHead><TableHead>设备</TableHead><TableHead>更新时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {transfers.data.map((transfer) => (
                  <TableRow key={transfer.id}>
                    <TableCell>
                      <p className="font-medium">{transferLabel(transfer)}</p>
                      <code className="block max-w-44 truncate text-xs text-muted-foreground" title={transfer.itemId}>{transfer.itemId}</code>
                    </TableCell>
                    <TableCell><StatusBadge value={transfer.state} /></TableCell>
                    <TableCell className="min-w-48">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>{formatBytes(transfer.completedBytes)} / {formatBytes(transfer.totalBytes)}</span>
                        <span>{formatProgress(transfer.completedBytes, transfer.totalBytes)}</span>
                      </div>
                      <Progress value={transfer.totalBytes ? (transfer.completedBytes / transfer.totalBytes) * 100 : 0} />
                      {transfer.error.message ? <p className="mt-1 text-xs text-destructive">{transfer.error.message}</p> : null}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{transfer.deviceId.slice(0, 8)}</code>
                      {transfer.peerDeviceIds.length ? <p className="text-xs text-muted-foreground">对端 {transfer.peerDeviceIds.length} 台</p> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(transfer.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      {!terminalStates.has(transfer.state) ? (
                        <ConfirmAction
                          trigger={<Button variant="ghost" size="icon-sm" aria-label="取消传输"><BanIcon className="size-4" /></Button>}
                          title="取消此传输？"
                          description="已经写入的临时数据会在后续清理中移除，已完成的对象不受影响。"
                          confirmLabel="取消传输"
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
