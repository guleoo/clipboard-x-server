import { useState, type ReactElement } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/frame/components/ui/alert-dialog"
import { Button } from "@/frame/components/ui/button"

export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  pending = false,
  onConfirm,
}: {
  readonly trigger: ReactElement
  readonly title: string
  readonly description: string
  readonly confirmLabel?: string
  readonly pending?: boolean
  readonly onConfirm: () => void
}) {
  const { t } = useTranslation("common")
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={trigger} onClick={() => setOpen(true)} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel render={<Button variant="outline" />}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() => {
              onConfirm()
              setOpen(false)
            }}
          >
            {pending ? t("processing") : confirmLabel ?? t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
