import { format } from "date-fns"

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

/** Saved durations as h:mm (0:30, 1:48); seconds are only for live timers. */
export function formatClock(seconds: number): string {
  const minutes = Math.round(Math.max(0, seconds) / 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
}

/** "12:00 – 12:30 PM", keeping AM/PM once when both ends share it; adds the end date when a range crosses midnight. */
export function formatTimeRange(start: Date | number | string, end: Date | number | string): string {
  const from = new Date(start)
  const to = new Date(end)
  if (format(from, "yyyy-MM-dd") !== format(to, "yyyy-MM-dd")) return `${format(from, "h:mm a")} – ${format(to, "MMM d, h:mm a")}`
  return `${format(from, format(from, "a") === format(to, "a") ? "h:mm" : "h:mm a")} – ${format(to, "h:mm a")}`
}

export function formatHours(seconds: number): string {
  const h = seconds / 3600
  return h.toFixed(1)
}

// Creating a formatter is far slower than using one, and lists format hundreds of amounts per render.
const currencyFormatters = new Map<string, Intl.NumberFormat>()

export function formatCurrency(amount: number, currency = "USD"): string {
  let formatter = currencyFormatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    })
    currencyFormatters.set(currency, formatter)
  }
  return formatter.format(amount)
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })
}
