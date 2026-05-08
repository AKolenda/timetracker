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
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/page-header"
import { useStore } from "@/lib/store"
import { formatCurrency, formatHours } from "@/lib/format"
import { cn } from "@/lib/utils"

interface DayData {
  earnings: number
  expenses: number
  hours: number
  entries: number
  paymentsDue: { invoiceNumber: string; total: number }[]
}

export default function CalendarPage() {
  const { data, getProject, getClient } = useStore()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const dayMap = useMemo(() => {
    const map = new Map<string, DayData>()

    for (const entry of data.timeEntries) {
      const key = entry.date
      const existing = map.get(key) ?? {
        earnings: 0,
        expenses: 0,
        hours: 0,
        entries: 0,
        paymentsDue: [],
      }
      existing.hours += entry.duration
      existing.entries += 1
      if (entry.billable) {
        const project = getProject(entry.projectId)
        if (project) {
          existing.earnings += (entry.duration / 3600) * project.rate
        }
      }
      map.set(key, existing)
    }

    for (const expense of data.expenses) {
      const key = expense.date
      const existing = map.get(key) ?? {
        earnings: 0,
        expenses: 0,
        hours: 0,
        entries: 0,
        paymentsDue: [],
      }
      existing.expenses += expense.amount
      map.set(key, existing)
    }

    for (const invoice of data.invoices) {
      if (invoice.status === "paid") continue
      const key = invoice.dueDate
      const existing = map.get(key) ?? {
        earnings: 0,
        expenses: 0,
        hours: 0,
        entries: 0,
        paymentsDue: [],
      }
      existing.paymentsDue.push({
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
      })
      map.set(key, existing)
    }

    return map
  }, [data.timeEntries, data.expenses, data.invoices, getProject])

  const monthTotals = useMemo(() => {
    let earnings = 0
    let expenses = 0
    let hours = 0
    let pendingPayments = 0

    for (const [key, day] of dayMap) {
      const d = new Date(key)
      if (d >= monthStart && d <= monthEnd) {
        earnings += day.earnings
        expenses += day.expenses
        hours += day.hours
        pendingPayments += day.paymentsDue.reduce((s, p) => s + p.total, 0)
      }
    }

    return { earnings, expenses, hours, pendingPayments }
  }, [dayMap, monthStart, monthEnd])

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

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Earnings, expenses, and payment schedule"
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Month Earnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(monthTotals.earnings)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Month Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(monthTotals.expenses)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Hours Worked
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold">
              {formatHours(monthTotals.hours)}h
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Payments Expected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(monthTotals.pendingPayments)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {format(currentMonth, "MMMM yyyy")}
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setCurrentMonth(new Date())}
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div
                  key={d}
                  className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd")
                const dayData = dayMap.get(key)
                const inMonth = isSameMonth(day, currentMonth)
                const selected = selectedDate && isSameDay(day, selectedDate)
                const today_ = isToday(day)

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "relative min-h-[72px] rounded-md border p-1.5 text-left transition-colors hover:bg-muted/50",
                      !inMonth && "opacity-30",
                      selected && "ring-2 ring-foreground",
                      today_ && "border-foreground/30"
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs font-medium",
                        today_ &&
                          "inline-flex size-5 items-center justify-center rounded-full bg-foreground text-background"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {dayData && (
                      <div className="mt-1 space-y-0.5">
                        {dayData.earnings > 0 && (
                          <div className="truncate rounded bg-emerald-500/10 px-1 text-[9px] font-medium text-emerald-600 dark:text-emerald-400">
                            +{formatCurrency(dayData.earnings)}
                          </div>
                        )}
                        {dayData.expenses > 0 && (
                          <div className="truncate rounded bg-red-500/10 px-1 text-[9px] font-medium text-red-600 dark:text-red-400">
                            -{formatCurrency(dayData.expenses)}
                          </div>
                        )}
                        {dayData.paymentsDue.length > 0 && (
                          <div className="truncate rounded bg-blue-500/10 px-1 text-[9px] font-medium text-blue-600 dark:text-blue-400">
                            Due: {formatCurrency(dayData.paymentsDue.reduce((s, p) => s + p.total, 0))}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
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
                  Click a day to see details
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
                      <div className="rounded-md bg-emerald-500/10 p-2 text-center">
                        <p className="text-[10px] font-medium text-muted-foreground">
                          Earned
                        </p>
                        <p className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(selectedDayData.earnings)}
                        </p>
                      </div>
                      <div className="rounded-md bg-red-500/10 p-2 text-center">
                        <p className="text-[10px] font-medium text-muted-foreground">
                          Spent
                        </p>
                        <p className="font-mono text-sm font-bold text-red-600 dark:text-red-400">
                          {formatCurrency(selectedDayData.expenses)}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedDayEntries.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Time Entries
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
                              <span className="shrink-0 font-mono text-xs text-muted-foreground">
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
                              <span className="shrink-0 font-mono text-xs text-red-600 dark:text-red-400">
                                -{formatCurrency(e.amount)}
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
                            Payments Due
                          </p>
                          {selectedDayData.paymentsDue.map((p) => (
                            <div
                              key={p.invoiceNumber}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="font-mono text-xs">
                                {p.invoiceNumber}
                              </span>
                              <span className="font-mono text-xs font-medium text-blue-600 dark:text-blue-400">
                                {formatCurrency(p.total)}
                              </span>
                            </div>
                          ))}
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
                Payment Schedule
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
                          <span className="font-mono text-xs font-medium">
                            {inv.invoiceNumber}
                          </span>
                          <Badge
                            variant="secondary"
                            className="bg-blue-500/10 text-[10px] text-blue-600 dark:text-blue-400"
                          >
                            {inv.status}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {inv.client?.name ?? "Unknown"} &middot; Due{" "}
                          {format(new Date(inv.dueDate), "MMM d")}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-sm font-bold">
                        {formatCurrency(inv.total)}
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
