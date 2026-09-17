import { useEffect, useMemo, useRef, useState } from "react"
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { HashIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { useApi, type Channel, type ClipboardItem, type Transfer } from "@/api"
import { ChannelEditor } from "@/components/domain/channel-editor"
import { ClipboardItemCard } from "@/components/domain/clipboard-item"
import { ConfirmAction } from "@/components/domain/confirm-action"
import { PublishDialog } from "@/components/domain/publish-dialog"
import { ErrorState, LoadingState } from "@/components/domain/states"
import { Button } from "@/frame/components/ui/button"
import { Input } from "@/frame/components/ui/input"
import { messageOf } from "@/utils/format"

function ChannelList({ channels, selected, select }: {
  readonly channels: readonly Channel[]
  readonly selected?: string
  readonly select: (channelId: string) => void
}) {
  return (
    <nav aria-label="Channels" className="space-y-1 px-2 py-2">
      {channels.map((channel) => (
        <button
          key={channel.id}
          type="button"
          className={[
            "flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm transition-colors",
            selected === channel.id ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          ].join(" ")}
          onClick={() => select(channel.id)}
        >
          <HashIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{channel.name}</span>
          <span className="shrink-0 text-[11px] opacity-70">{channel.members.filter((member) => member.kind === "client").length}</span>
        </button>
      ))}
    </nav>
  )
}

function columnCount(): number {
  if (window.innerWidth >= 1536) return 3
  if (window.innerWidth >= 640) return 2
  return 1
}

function ClipboardFeed({ items, transfers, remove }: {
  readonly items: readonly ClipboardItem[]
  readonly transfers: ReadonlyMap<string, Transfer>
  readonly remove: (item: ClipboardItem) => void
}) {
  const [count, setCount] = useState(columnCount)
  useEffect(() => {
    const update = () => setCount(columnCount())
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])
  const columns = useMemo(() => {
    const result = Array.from({ length: count }, () => [] as ClipboardItem[])
    const newestFirst = [...items].sort((left, right) =>
      right.createdAt - left.createdAt || right.id.localeCompare(left.id))
    newestFirst.forEach((item, index) => result[index % count]!.push(item))
    return result
  }, [count, items])

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {columns.map((column, index) => (
        <div key={index} className="min-w-0" data-testid="clipboard-column">
          {column.map((item) => (
            <ClipboardItemCard
              key={item.id}
              item={item}
              {...(transfers.get(item.id) ? { transfer: transfers.get(item.id)! } : {})}
              remove={remove}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ClipboardPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useSearchParams()
  const selectedId = search.get("channelId") ?? undefined
  const queryText = search.get("query") ?? ""
  const channels = useQuery({ queryKey: ["channels"], queryFn: () => api.channels() })
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api.devices() })
  const current = channels.data?.find((channel) => channel.id === selectedId)

  useEffect(() => {
    if (!channels.data?.length || current) return
    setSearch((value) => {
      const next = new URLSearchParams(value)
      next.set("channelId", channels.data[0]!.id)
      return next
    }, { replace: true })
  }, [channels.data, current, setSearch])

  const filters = useMemo(() => ({
    ...(current ? { channelId: current.id } : {}),
    ...(queryText ? { query: queryText } : {}),
    limit: 100,
  }), [current, queryText])
  const items = useInfiniteQuery({
    queryKey: ["items", filters],
    queryFn: ({ pageParam }) => api.items({ ...filters, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.cursor : undefined,
    enabled: Boolean(current),
  })
  const visibleItems = useMemo(() => items.data?.pages.flatMap((page) => page.items) ?? [], [items.data])
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [current?.id, queryText])
  useEffect(() => {
    if (!items.hasNextPage || items.isFetchingNextPage || items.isFetchNextPageError
      || !scrollRef.current || !loadMoreRef.current || typeof window.IntersectionObserver === "undefined") return
    let requested = false
    const observer = new window.IntersectionObserver((entries) => {
      if (requested || !entries.some((entry) => entry.isIntersecting)) return
      requested = true
      void items.fetchNextPage()
    }, { root: scrollRef.current, rootMargin: "0px 0px 240px 0px" })
    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [items.data?.pages.length, items.hasNextPage, items.isFetchingNextPage, items.isFetchNextPageError, items.fetchNextPage])
  const transfers = useQuery({
    queryKey: ["transfers"],
    queryFn: () => api.transfers(32),
    refetchInterval: 4_000,
  })
  const recentTransferByItem = useMemo(() => {
    const result = new Map<string, NonNullable<typeof transfers.data>[number]>()
    for (const transfer of transfers.data ?? []) {
      if (!result.has(transfer.itemId)) result.set(transfer.itemId, transfer)
    }
    return result
  }, [transfers.data])
  const removeItem = useMutation({
    mutationFn: (item: ClipboardItem) => api.deleteItem(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] })
      toast.success("内容已删除")
    },
    onError: (error) => toast.error(messageOf(error)),
  })
  const removeChannel = useMutation({
    mutationFn: (channel: Channel) => api.deleteChannel(channel.id),
    onSuccess: async () => {
      setSearch(new URLSearchParams(), { replace: true })
      await queryClient.invalidateQueries({ queryKey: ["channels"] })
      toast.success("Channel 已删除")
    },
    onError: (error) => toast.error(messageOf(error)),
  })
  const selectChannel = (channelId: string) => {
    setSearch((value) => {
      const next = new URLSearchParams(value)
      next.set("channelId", channelId)
      next.delete("query")
      return next
    })
  }
  const setQuery = (value: string) => {
    setSearch((currentSearch) => {
      const next = new URLSearchParams(currentSearch)
      if (value) next.set("query", value)
      else next.delete("query")
      return next
    }, { replace: true })
  }
  const saved = async (channelId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["channels"] }),
      queryClient.invalidateQueries({ queryKey: ["items"] }),
    ])
    selectChannel(channelId)
  }

  if (channels.isPending || devices.isPending) return <div className="p-5"><LoadingState /></div>
  if (channels.error) return <div className="p-5"><ErrorState error={channels.error} retry={() => channels.refetch()} /></div>
  if (devices.error) return <div className="p-5"><ErrorState error={devices.error} retry={() => devices.refetch()} /></div>

  return (
    <div className="mx-auto grid h-[calc(100dvh-3.5rem)] min-h-0 w-full max-w-[1600px] overflow-hidden lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 border-r bg-muted/15 lg:flex lg:flex-col">
        <div className="flex h-12 items-center justify-between border-b px-4">
          <h1 className="text-sm font-semibold">Channels</h1>
          <ChannelEditor
            devices={devices.data}
            trigger={<Button variant="ghost" size="icon-sm" title="创建 Channel" aria-label="创建 Channel"><PlusIcon className="size-4" /></Button>}
            saved={saved}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {channels.data.length ? <ChannelList channels={channels.data} {...(current ? { selected: current.id } : {})} select={selectChannel} /> : (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">还没有 Channel</p>
          )}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 sm:px-6">
          <select
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm lg:hidden"
            aria-label="选择 Channel"
            value={current?.id ?? ""}
            onChange={(event) => selectChannel(event.target.value)}
          >
            <option value="" disabled>选择 Channel</option>
            {channels.data.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
          </select>
          <div className="hidden min-w-0 flex-1 items-center gap-2 lg:flex">
            <HashIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="truncate text-sm font-semibold">{current?.name ?? "剪切板"}</h2>
            {current ? <span className="text-xs text-muted-foreground">{current.members.length} 个成员</span> : null}
          </div>
          {current ? (
            <>
              <ChannelEditor
                channel={current}
                devices={devices.data}
                trigger={<Button variant="ghost" size="icon-sm" title="编辑 Channel" aria-label="编辑 Channel"><PencilIcon className="size-4" /></Button>}
                saved={saved}
              />
              <ConfirmAction
                trigger={<Button variant="ghost" size="icon-sm" title="删除 Channel" aria-label="删除 Channel"><Trash2Icon className="size-4 text-destructive" /></Button>}
                title={`删除“${current.name}”？`}
                description="Channel 会从列表中移除，现有成员将无法再访问它。"
                confirmLabel="删除"
                pending={removeChannel.isPending}
                onConfirm={() => removeChannel.mutate(current)}
              />
              <PublishDialog
                channel={current}
                published={() => {
                  queryClient.invalidateQueries({ queryKey: ["items"] })
                  queryClient.invalidateQueries({ queryKey: ["transfers"] })
                }}
              />
            </>
          ) : null}
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6" aria-label="剪切板内容">
          {current ? (
            <>
              <label className="relative mb-5 block max-w-md">
                <span className="sr-only">搜索剪切板内容</span>
                <SearchIcon className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" aria-hidden="true" />
                <Input className="pl-8" value={queryText} placeholder="搜索当前 Channel" onChange={(event) => setQuery(event.target.value)} />
              </label>
              {items.isPending ? <LoadingState /> : items.error && !items.data ? <ErrorState error={items.error} retry={() => items.refetch()} />
                : visibleItems.length ? (
                  <ClipboardFeed
                    items={visibleItems}
                    transfers={recentTransferByItem}
                    remove={(value) => removeItem.mutate(value)}
                  />
                ) : (
                  <div className="grid min-h-72 place-items-center border-y border-dashed text-center">
                    <div>
                      <p className="text-sm font-medium">{queryText ? "没有匹配的内容" : "这个 Channel 还是空的"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{queryText ? "试试其他关键词" : "从这里添加文本或图片，内容会同步到频道设备。"}</p>
                    </div>
                  </div>
                )}
              {items.hasNextPage ? (
                <div ref={loadMoreRef} className="flex min-h-16 items-center justify-center py-4">
                  <Button variant="outline" disabled={items.isFetchingNextPage} onClick={() => void items.fetchNextPage()}>
                    {items.isFetchingNextPage ? "正在加载" : items.isFetchNextPageError ? "加载失败，重试" : "加载更多"}
                  </Button>
                </div>
              ) : null}
            </>
          ) : channels.data.length === 0 ? (
            <div className="grid min-h-96 place-items-center text-center">
              <div className="max-w-sm">
                <HashIcon className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
                <h2 className="font-semibold">创建第一个 Channel</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Channel 会连接你的设备，也承载从 Web 发布的剪切板内容。</p>
                <div className="mt-5"><ChannelEditor devices={devices.data} trigger={<Button><PlusIcon className="size-4" />创建 Channel</Button>} saved={saved} /></div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

    </div>
  )
}
