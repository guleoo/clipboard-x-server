const styles: Readonly<Record<string, string>> = {
  online: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  available: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  completed: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  transferring: "bg-primary/12 text-primary",
  verifying: "bg-primary/12 text-primary",
  requesting: "bg-primary/12 text-primary",
  queued: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  "waiting-for-peer": "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  "source-required": "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  failed: "bg-destructive/12 text-destructive",
  expired: "bg-destructive/12 text-destructive",
  disabled: "bg-muted text-muted-foreground",
  offline: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
}

export function StatusBadge({ value }: { readonly value: string }) {
  const { t } = useTranslation("common")
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[value] ?? "bg-muted text-muted-foreground"}`}>
      {Object.hasOwn(common.status, value) ? t(`status.${value as keyof typeof common.status}`) : value}
    </span>
  )
}
import { useTranslation } from "react-i18next"
import common from "@/locales/en/common"
