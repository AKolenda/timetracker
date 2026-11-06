import { localDateString } from "@/lib/datetime"

/** What happens to a scheduled invoice email that falls on a Saturday or Sunday. */
export type WeekendSendRule = "monday" | "friday" | "weekend"

export const DEFAULT_WEEKEND_SEND_RULE: WeekendSendRule = "monday"

export const WEEKEND_SEND_RULE_LABELS: Record<WeekendSendRule, string> = {
  monday: "Send on the Monday after",
  friday: "Send on the Friday before",
  weekend: "Send on the weekend",
}

export function parseWeekendSendRule(value: unknown): WeekendSendRule {
  return value === "monday" || value === "friday" || value === "weekend"
    ? value
    : DEFAULT_WEEKEND_SEND_RULE
}

export interface InvoiceSchedule {
  weeks: number | null
  /** "YYYY-MM-DD" date of the first send. */
  anchor: string | null
  /** Timestamp of the last invoice emailed to the client. */
  lastSent: string | null
}

/** Adds days to a "YYYY-MM-DD" date without crossing through a timezone. */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday, for a "YYYY-MM-DD" date. */
function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function isWeekend(date: string): boolean {
  const day = weekday(date)
  return day === 0 || day === 6
}

/** Moves a Saturday or Sunday send to the Monday after or the Friday before. */
export function moveOffWeekend(date: string, rule: WeekendSendRule): string {
  const day = weekday(date)
  if (rule === "weekend" || !isWeekend(date)) return date
  if (rule === "friday") return addDaysToDate(date, day === 6 ? -1 : -2)
  return addDaysToDate(date, day === 6 ? 2 : 1)
}

/**
 * The date of the next scheduled invoice email, as "YYYY-MM-DD" in `timezone`.
 * Counts from the day of the last send (or from the first send date), so a send
 * that ran a few seconds late never pushes the next one back a day.
 */
export function nextScheduledSend(
  schedule: InvoiceSchedule,
  rule: WeekendSendRule,
  timezone?: string
): string | null {
  const { weeks, anchor, lastSent } = schedule
  if (!weeks || weeks <= 0) return null
  let date: string | null = null
  if (lastSent) {
    date = addDaysToDate(localDateString(new Date(lastSent), timezone), weeks * 7)
  } else if (anchor) {
    date = anchor.slice(0, 10)
  }
  return date ? moveOffWeekend(date, rule) : null
}

/** Every scheduled send from the next one up to and including `until` ("YYYY-MM-DD"). */
export function scheduledSendsUntil(
  schedule: InvoiceSchedule,
  rule: WeekendSendRule,
  until: string,
  timezone?: string
): string[] {
  const dates: string[] = []
  let date = nextScheduledSend(schedule, rule, timezone)
  const weeks = schedule.weeks ?? 0
  while (date && date <= until) {
    dates.push(date)
    // Each send counts from the day it actually went out.
    date = moveOffWeekend(addDaysToDate(date, weeks * 7), rule)
  }
  return dates
}

/**
 * Whether the email job should send to this client today. A send that is still
 * owed never goes out on a weekend unless the rule allows weekend sends.
 */
export function isScheduledSendDue(
  schedule: InvoiceSchedule,
  rule: WeekendSendRule,
  now: Date,
  timezone?: string
): boolean {
  const next = nextScheduledSend(schedule, rule, timezone)
  if (!next) return false
  const today = localDateString(now, timezone)
  if (rule !== "weekend" && isWeekend(today)) return false
  return today >= next
}
