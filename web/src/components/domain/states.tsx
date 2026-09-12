import type { ReactNode } from "react"
import { AlertTriangleIcon, InboxIcon, LoaderCircleIcon } from "lucide-react"
import { Button } from "@/frame/components/ui/button"

export function LoadingState({ label = "正在加载" }: { readonly label?: string }) {
  return (
    <div className="grid min-h-48 place-items-center text-sm text-muted-foreground" role="status">
      <span className="inline-flex items-center gap-2">
        <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
        {label}
      </span>
    </div>
  )
}

export function ErrorState({ error, retry }: { readonly error: unknown; readonly retry?: () => void }) {
  return (
    <div className="surface-raised grid min-h-40 place-items-center p-6 text-center" role="alert">
      <div>
        <AlertTriangleIcon className="mx-auto size-5 text-destructive" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium">加载失败</p>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "服务器暂时无法完成请求"}
        </p>
        {retry ? <Button className="mt-4" variant="outline" onClick={retry}>重试</Button> : null}
      </div>
    </div>
  )
}

export function EmptyState({ title, description, action }: {
  readonly title: string
  readonly description: string
  readonly action?: ReactNode
}) {
  return (
    <div className="surface-sunken grid min-h-48 place-items-center p-6 text-center">
      <div>
        <InboxIcon className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-sm font-medium">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  )
}
