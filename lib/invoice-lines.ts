import { format, parseISO } from "date-fns"
import type { InvoiceLineItem } from "./types.ts"
import { normalizeBillFactor } from "./billing.ts"

/** The fields grouping needs, so the browser store and the cron's raw rows both fit. */
export type LineEntry = { id: string; projectId: string; description: string; date: string; duration: number; billFactor?: number; invoiceLine?: string | null }

export type TimeLine<T extends LineEntry> = {
  /** Stable while the line's entries keep their label: the label for a group, else the entry id. */
  key: string
  /** The shared label of a grouped line; null when the line bills one unlabelled entry. */
  label: string | null
  description: string
  entries: T[]
  firstDate: string
  lastDate: string
  seconds: number
}

export const invoiceLineLabel = (entry: Pick<LineEntry, "invoiceLine">) => entry.invoiceLine?.trim() || null

const billed = (entry: LineEntry) => Math.round(entry.duration * normalizeBillFactor(entry.billFactor ?? 1))

/** One line per labelled group (per project) and one per unlabelled entry, in first-seen order. */
export function groupTimeLines<T extends LineEntry>(entries: T[]): TimeLine<T>[] {
  const lines = new Map<string, TimeLine<T>>()
  for (const entry of entries) {
    const label = invoiceLineLabel(entry)
    const key = label ? `line:${entry.projectId}:${label}` : `entry:${entry.id}`
    const line = lines.get(key) ?? { key, label, description: label ?? (entry.description || "Time entry"), entries: [], firstDate: entry.date, lastDate: entry.date, seconds: 0 }
    line.entries.push(entry)
    if (entry.date < line.firstDate) line.firstDate = entry.date
    if (entry.date > line.lastDate) line.lastDate = entry.date
    line.seconds += billed(entry)
    lines.set(key, line)
  }
  return [...lines.values()]
}

/** "Nov 2", "Nov 2–5" or "Oct 30–Nov 2". */
export function lineDates(first: string, last: string) {
  const a = parseISO(first)
  const b = parseISO(last)
  if (first === last) return format(a, "MMM d")
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() ? `${format(a, "MMM d")}–${format(b, "d")}` : `${format(a, "MMM d")}–${format(b, "MMM d")}`
}

export const lineAmount = (seconds: number, rate: number) => Number(((seconds / 3600) * rate).toFixed(2))

export function timeLineItem<T extends LineEntry>(line: TimeLine<T>, projectName: string, rate: number): Omit<InvoiceLineItem, "id" | "invoiceId"> {
  const hours = line.seconds / 3600
  return {
    description: `${projectName}: ${line.description} (${lineDates(line.firstDate, line.lastDate)})`,
    quantity: Number(hours.toFixed(2)),
    unitPrice: rate,
    amount: lineAmount(line.seconds, rate),
    type: "time",
    sourceId: line.entries[0].id,
    sourceIds: line.entries.length > 1 ? line.entries.map((entry) => entry.id) : null,
  }
}
