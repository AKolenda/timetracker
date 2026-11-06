"use client"

import { useMemo, useState } from "react"
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addDays,
} from "date-fns"
import { CalendarClock, ChevronLeft, ChevronRight, Clock, DollarSign, Receipt } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/page-header"
import { StatCard, StatGrid } from "@/components/stat-card"
import { InvoiceStatusBadge } from "@/components/status-badge"
import { useStore } from "@/lib/store"
import { useMoney } from "@/lib/display-currency"
import { formatHours } from "@/lib/format"
import { billedSeconds } from "@/lib/billing"
import { cn } from "@/lib/utils"

interface DayData {
  earnings: number
  expenses: number
  hours: number
  entries: number
  paymentsDue: { invoiceNumber: string; total: number }[]
  scheduledSends: {
    clientId: string
    clientName: string
    color: string
    autoSend: boolean
  }[]
}

type MarkerKind = "earned" | "spent" | "due" | "send"

const markerNames: Record<MarkerKind, string> = {
  earned: "Earned",
  spent: "Spent",
  due: "Payment due",
  send: "Invoice email",
}

const markerDot: Record<MarkerKind, string> = {
  earned: "bg-success",
  spent: "bg-destructive",
  due: "bg-info",
  send: "bg-warning",
}

const markerChip: Record<MarkerKind, string> = {
  earned: "bg-success/10 text-success-foreground",
  spent: "bg-destructive/10 text-destructive",
  due: "bg-info/10 text-info",
  send: "bg-warning/15 text-warning-foreground",
}

function emptyDay(): DayData {
  return {
    earnings: 0,
    expenses: 0,
    hours: 0,
    entries: 0,
    paymentsDue: [],
    scheduledSends: [],
  }
}

export default function CalendarPage() {
  const { money } = useMoney()
  const { data, getProject, getClient } = useStore()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => new Date())

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const dayMap = useMemo(() => {
    const map = new Map<string, DayData>()

    for (const entry of data.timeEntries) {
      const key = entry.date
      const existing = map.get(key) ?? emptyDay()
      existing.hours += entry.duration
      existing.entries += 1
      if (entry.billable) {
        const project = getProject(entry.projectId)
        if (project) {
          existing.earnings += (billedSeconds(entry) / 3600) * project.rate
        }
      }
      map.set(key, existing)
    }

    for (const expense of data.expenses) {
      const key = expense.date
      const existing = map.get(key) ?? emptyDay()
      existing.expenses += expense.amount
      map.set(key, existing)
    }

    for (const invoice of data.invoices) {
      if (invoice.status === "paid") continue
      const key = invoice.dueDate
      const existing = map.get(key) ?? emptyDay()
      existing.paymentsDue.push({
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
      })
      map.set(key, existing)
    }

    const horizonStart = startOfWeek(startOfMonth(currentMonth))
    const horizonEnd = endOfWeek(endOfMonth(addMonths(currentMonth, 6)))
    const ONE_DAY = 86_400_000
    for (const client of data.clients) {
      if (!client.invoiceScheduleEnabled || !client.invoiceScheduleWeeks) continue
      const weeks = client.invoiceScheduleWeeks
      let next: Date | null = null
      if (client.lastInvoiceSent) {
        next = new Date(
          new Date(client.lastInvoiceSent).getTime() + weeks * 7 * ONE_DAY
        )
      } else if (client.invoiceScheduleAnchor) {
        next = new Date(client.invoiceScheduleAnchor)
      }
      if (!next) continue
      while (next <= horizonEnd) {
        if (next >= horizonStart) {
          const key = format(next, "yyyy-MM-dd")
          const existing = map.get(key) ?? emptyDay()
          existing.scheduledSends.push({
            clientId: client.id,
            clientName: client.name,
            color: client.color,
            autoSend: client.invoiceScheduleAutoSend,
          })
          map.set(key, existing)
        }
        next = new Date(next.getTime() + weeks * 7 * ONE_DAY)
      }
    }

    return map
  }, [data.timeEntries, data.expenses, data.invoices, data.clients, getProject, currentMonth])

  const monthTotals = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    let earnings = 0
    let expenses = 0
    let hours = 0
    let pendingPayments = 0
    let dueCount = 0

    for (const [key, day] of dayMap) {
      const d = new Date(key)
      if (d >= monthStart && d <= monthEnd) {
        earnings += day.earnings
        expenses += day.expenses
        hours += day.hours
        pendingPayments += day.paymentsDue.reduce((s, p) => s + p.total, 0)
        dueCount += day.paymentsDue.length
      }
    }

    return { earnings, expenses, hours, pendingPayments, dueCount }
  }, [dayMap, currentMonth])

  const selectedDayData = useMemo(() => {
    if (!selectedDate) return null
    const key = format(selectedDate, "yyyy-MM-dd")
    return dayMap.get(key) ?? null
  }, [selectedDate, dayMap])

  const selectedDayEntries = useMemo(() => {
    if (!selectedDate) return []
    const dateStr = format(selectedDate, "yyyy-MM-dd")
    return data.timeEntries
      .filter((e) => e.date === dateStr)
      .map((e) => {
        const project = getProject(e.projectId)
        const client = project ? getClient(project.clientId) : undefined
        return { ...e, project, client }
      })
  }, [selectedDate, data.timeEntries, getProject, getClient])

  const selectedDayExpenses = useMemo(() => {
    if (!selectedDate) return []
    const dateStr = format(selectedDate, "yyyy-MM-dd")
    return data.expenses
      .filter((e) => e.date === dateStr)
      .map((e) => {
        const project = getProject(e.projectId)
        return { ...e, project }
      })
  }, [selectedDate, data.expenses, getProject])

  // Payment schedule: upcoming invoice due dates
  const upcomingPayments = useMemo(() => {
    const today = new Date()
    const twoMonthsOut = addDays(today, 60)
    return data.invoices
      .filter((inv) => {
        if (inv.status === "paid") return false
        const due = new Date(inv.dueDate)
        return due >= today && due <= twoMonthsOut
      })
      .sort(
        (a, b) =>
          new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      )
      .map((inv) => {
        const client = getClient(inv.clientId)
        return { ...inv, client }
      })
  }, [data.invoices, getClient])

  const selectToday = () => {
    const today = new Date()
    setCurrentMonth(today)
    setSelectedDate(today)
  }

  return (
    <>
      <PageHeader
        title="Calendar & reports"
      />

      <StatGrid className="mb-6">
        <StatCard
          label="Month earnings"
          icon={DollarSign}
          value={money(monthTotals.earnings)}
          hint="Billable time"
        />
        <StatCard
          label="Month expenses"
          icon={Receipt}
          value={money(monthTotals.expenses)}
        />
        <StatCard
          label="Hours worked"
          icon={Clock}
          value={`${formatHours(monthTotals.hours)}h`}
        />
        <StatCard
          label="Payments expected"
          icon={CalendarClock}
          value={money(monthTotals.pendingPayments)}
          hint={`${monthTotals.dueCount} unpaid ${monthTotals.dueCount === 1 ? "invoice" : "invoices"} due`}
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-stretch">
        <Card className="flex flex-col lg:col-span-2 lg:min-h-[calc(100dvh-20rem)]">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {format(currentMonth, "MMMM yyyy")}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Previous month"
                title="Previous month"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={selectToday}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Next month"
                title="Next month"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <div
              className="grid flex-1 grid-cols-7 gap-px"
              style={{ gridTemplateRows: `auto repeat(${Math.ceil(days.length / 7)}, minmax(0, 1fr))` }}
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div
                  key={d}
                  className="py-2 text-center text-xs font-medium text-muted-foreground"
                >
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd")
                const dayData = dayMap.get(key)
                const inMonth = isSameMonth(day, currentMonth)
                const selected = !!selectedDate && isSameDay(day, selectedDate)
                const today_ = isToday(day)
                const dueTotal = dayData?.paymentsDue.reduce((s, p) => s + p.total, 0) ?? 0
                const markers = dayData
                  ? [
                      dayData.earnings > 0 && { kind: "earned" as const, text: `+${money(dayData.earnings)}`, label: `${money(dayData.earnings)} earned` },
                      dayData.expenses > 0 && { kind: "spent" as const, text: `-${money(dayData.expenses)}`, label: `${money(dayData.expenses)} spent` },
                      dayData.paymentsDue.length > 0 && { kind: "due" as const, text: `Due ${money(dueTotal)}`, label: `${money(dueTotal)} due` },
                      dayData.scheduledSends.length > 0 && {
                        kind: "send" as const,
                        text: `${dayData.scheduledSends.length} invoice ${dayData.scheduledSends.length === 1 ? "email" : "emails"}`,
                        label: `${dayData.scheduledSends.length} scheduled invoice ${dayData.scheduledSends.length === 1 ? "email" : "emails"}`,
                      },
                    ].filter((m) => !!m)
                  : []
                const dayLabel = [format(day, "EEEE, MMMM d"), ...markers.map((m) => m.label)].join(", ")

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDate(day)}
                    aria-label={dayLabel}
                    aria-pressed={selected}
                    aria-current={today_ ? "date" : undefined}
                    className={cn(
                      "relative flex min-h-[52px] flex-col items-start rounded-md border p-1 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-[72px] sm:p-1.5 lg:min-h-0",
                      !inMonth && "opacity-40",
                      today_ && "border-primary/40",
                      selected && "bg-primary/5 ring-2 ring-primary"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-5 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                        today_ && "bg-primary text-primary-foreground"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {markers.length > 0 && (
                      <>
                        <div aria-hidden className="mt-auto flex flex-wrap gap-1 pb-0.5 pl-0.5 sm:hidden">
                          {markers.map((m) => (
                            <span key={m.kind} className={cn("size-1.5 rounded-full", markerDot[m.kind])} />
                          ))}
                        </div>
                        <div aria-hidden className="mt-1 hidden w-full min-w-0 space-y-0.5 sm:block">
                          {markers.map((m) => (
                            <div
                              key={m.kind}
                              title={m.label}
                              className={cn("truncate rounded-sm px-1 text-[11px] leading-4 font-medium tabular-nums", markerChip[m.kind])}
                            >
                              {m.text}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
            <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {(Object.keys(markerNames) as MarkerKind[]).map((kind) => (
                <li key={kind} className="flex items-center gap-1.5">
                  <span aria-hidden className={cn("size-1.5 rounded-full", markerDot[kind])} />
                  {markerNames[kind]}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Day Detail */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {selectedDate
                  ? format(selectedDate, "EEEE, MMMM d")
                  : "Select a day"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedDate ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Select a day to see details
                </p>
              ) : !selectedDayData &&
                selectedDayEntries.length === 0 &&
                selectedDayExpenses.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No activity on this day
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedDayData && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md bg-success/10 p-2 text-center">
                        <p className="text-xs font-medium text-muted-foreground">
                          Earned
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-success-foreground">
                          {money(selectedDayData.earnings)}
                        </p>
                      </div>
                      <div className="rounded-md bg-destructive/10 p-2 text-center">
                        <p className="text-xs font-medium text-muted-foreground">
                          Spent
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-destructive">
                          {money(selectedDayData.expenses)}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedDayEntries.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Time entries
                        </p>
                        <div className="space-y-1.5">
                          {selectedDayEntries.map((e) => (
                            <div
                              key={e.id}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                {e.client && (
                                  <div
                                    className="size-2 shrink-0 rounded-full"
                                    style={{
                                      backgroundColor: e.client.color,
                                    }}
                                  />
                                )}
                                <span className="truncate">
                                  {e.description || e.project?.name || "Untitled"}
                                </span>
                              </div>
                              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                {formatHours(e.duration)}h
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {selectedDayExpenses.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Expenses
                        </p>
                        <div className="space-y-1.5">
                          {selectedDayExpenses.map((e) => (
                            <div
                              key={e.id}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              <span className="truncate">
                                {e.description}
                              </span>
                              <span className="shrink-0 text-xs tabular-nums text-destructive">
                                -{money(e.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {selectedDayData &&
                    selectedDayData.paymentsDue.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            Payments due
                          </p>
                          {selectedDayData.paymentsDue.map((p) => (
                            <div
                              key={p.invoiceNumber}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-xs font-medium tabular-nums">
                                {p.invoiceNumber}
                              </span>
                              <span className="text-xs font-medium tabular-nums text-info">
                                {money(p.total)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                  {selectedDayData &&
                    selectedDayData.scheduledSends.length > 0 && (
                      <>
                        <Separator />
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                            Scheduled invoice emails
                          </p>
                          <div className="space-y-1.5">
                            {selectedDayData.scheduledSends.map((s) => (
                              <div
                                key={s.clientId}
                                className="flex items-center justify-between gap-2 rounded-md bg-warning/10 px-2 py-1.5"
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <div
                                    className="size-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: s.color }}
                                  />
                                  <span className="truncate text-sm font-medium">
                                    {s.clientName}
                                  </span>
                                </div>
                                <span className="shrink-0 text-xs font-medium text-warning-foreground">
                                  {s.autoSend ? "Auto-send" : "Draft only"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Payments */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Payment schedule
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingPayments.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No upcoming payments
                </p>
              ) : (
                <div className="space-y-2">
                  {upcomingPayments.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium tabular-nums">
                            {inv.invoiceNumber}
                          </span>
                          <InvoiceStatusBadge status={inv.status} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {inv.client?.name ?? "Unknown"} &middot; Due{" "}
                          {format(new Date(inv.dueDate), "MMM d")}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {money(inv.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
