export function format(timestamp: number, { locale = "en", offsetMinutes = 0 }: {
  readonly locale?: string
  readonly offsetMinutes?: number
} = {}): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(timestamp + offsetMinutes * 60_000)
}

export function offsetLabel(minutes: number): string {
  const absolute = Math.abs(minutes)
  return `UTC${minutes < 0 ? "−" : "+"}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`
}

export const DateTime = { format, offsetLabel }
