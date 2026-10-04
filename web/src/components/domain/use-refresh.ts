import { useEffect, useId, useRef } from "react"
import { toast } from "sonner"
import { i18n } from "@/frame/common/i18n"
import { messageOf } from "@/utils/format"

interface Task {
  timer: ReturnType<typeof setTimeout> | null
  readonly messageId: string | number
}

export function useRefresh(refresh: () => Promise<{ readonly error: unknown }>, scope: string) {
  const messageId = useId()
  const taskRef = useRef<Task | null>(null)
  useEffect(() => () => {
    const task = taskRef.current
    if (!task) return
    if (task.timer !== null) clearTimeout(task.timer)
    toast.dismiss(task.messageId)
    taskRef.current = null
  }, [scope])

  return () => {
    const previous = taskRef.current
    if (previous && previous.timer === null) return
    if (previous && previous.timer !== null) clearTimeout(previous.timer)
    const task: Task = { timer: null, messageId: toast.loading(i18n.t("refreshing"), { id: messageId }) }
    taskRef.current = task
    task.timer = setTimeout(async () => {
      task.timer = null
      try {
        const { error } = await refresh()
        if (taskRef.current !== task) return
        if (error) toast.error(messageOf(error), { id: task.messageId })
        else toast.success(i18n.t("refreshed"), { id: task.messageId })
      } catch (error) {
        if (taskRef.current === task) toast.error(messageOf(error), { id: task.messageId })
      } finally {
        if (taskRef.current === task) taskRef.current = null
      }
    }, 300)
  }
}
