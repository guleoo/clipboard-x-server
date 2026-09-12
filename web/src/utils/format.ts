import { DateTime } from "@/frame/common/date"

export function formatDate(value: number): string {
  return value > 0 ? DateTime.format(value) : "从未"
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  const units = ["KiB", "MiB", "GiB"]
  let size = value / 1024
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`
}

export function formatProgress(completed: number, total: number): string {
  return total > 0 ? `${Math.round((completed / total) * 100)}%` : "—"
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试"
}
