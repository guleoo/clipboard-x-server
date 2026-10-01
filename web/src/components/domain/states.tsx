import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangleIcon, InboxIcon, LoaderCircleIcon } from "lucide-react"
import { Button } from "@/frame/components/ui/button"
import { messageOf } from "@/utils/format"

export function LoadingState({ label }: { readonly label?: string }) {
  const { t } = useTranslation("common")
  return (
    <div className="grid min-h-48 place-items-center text-sm text-muted-foreground" role="status">
      <span className="inline-flex items-center gap-2">
        <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
        {label ?? t("loading")}
      </span>
    </div>
  )
}

export function ErrorState({ error, retry }: { readonly error: unknown; readonly retry?: () => void }) {
  const { t } = useTranslation("common")
  return (
    <div className="surface-raised grid min-h-40 place-items-center p-6 text-center" role="alert">
      <div>
        <AlertTriangleIcon className="mx-auto size-5 text-destructive" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium">{t("loadFailed")}</p>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          {messageOf(error)}
        </p>
        {retry ? <Button className="mt-4" variant="outline" onClick={retry}>{t("retry")}</Button> : null}
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
