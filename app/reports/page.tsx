"use client"

import { useMemo, useState } from "react"
import { CalendarIcon } from "lucide-react"
import { format, startOfMonth, endOfMonth, isWithinInterval, startOfWeek, endOfWeek } from "date-fns"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/page-header"
import { useStore } from "@/lib/store"
import { formatCurrency, formatHours } from "@/lib/format"
import { cn } from "@/lib/utils"

type DateRange = { from: Date; to: Date }

export default function ReportsPage() {
  const { data, getClient, getProject } = useStore()
  const [range, setRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  })

  function setPreset(preset: "week" | "month" | "all") {
    const now = new Date()
    if (preset === "week") {
      setRange({ from: startOfWeek(now), to: endOfWeek(now) })
    } else if (preset === "month") {
      setRange({ from: startOfMonth(now), to: endOfMonth(now) })
    } else {
      setRange({ from: new Date(2020, 0, 1), to: now })
    }
  }

  const filtered = useMemo(() => {
    const entries = data.timeEntries.filter((e) => {
      const d = new Date(e.date)
      return isWithinInterval(d, { start: range.from, end: range.to })
    })
    const expenses = data.expenses.filter((e) => {
      const d = new Date(e.date)
      return isWithinInterval(d, { start: range.from, end: range.to })
    })
    return { entries, expenses }
  }, [data.timeEntries, data.expenses, range])

  const totalHours = filtered.entries.reduce((s, e) => s + e.duration, 0)
  const billableHours = filtered.entries
    .filter((e) => e.billable)
    .reduce((s, e) => s + e.duration, 0)
  const nonBillableHours = totalHours - billableHours

  const totalRevenue = filtered.entries
    .filter((e) => e.billable)
    .reduce((s, e) => {
      const p = getProject(e.projectId)
      return s + (p ? (e.duration / 3600) * p.rate : 0)
    }, 0)

  const totalExpenses = filtered.expenses.reduce((s, e) => s + e.amount, 0)

  const billablePercent = totalHours > 0 ? (billableHours / totalHours) * 100 : 0

  const clientBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { hours: number; billableHours: number; revenue: number; expenses: number }
    >()
    for (const entry of filtered.entries) {
      const project = getProject(entry.projectId)
      if (!project) continue
      const clientId = project.clientId
      const existing = map.get(clientId) ?? {
        hours: 0,
        billableHours: 0,
        revenue: 0,
        expenses: 0,
      }
      existing.hours += entry.duration
      if (entry.billable) {
        existing.billableHours += entry.duration
        existing.revenue += (entry.duration / 3600) * project.rate
      }
      map.set(clientId, existing)
    }
    for (const expense of filtered.expenses) {
      const project = getProject(expense.projectId)
      if (!project) continue
      const clientId = project.clientId
      const existing = map.get(clientId) ?? {
        hours: 0,
        billableHours: 0,
        revenue: 0,
        expenses: 0,
      }
      existing.expenses += expense.amount
      map.set(clientId, existing)
    }
    return Array.from(map.entries())
      .map(([clientId, stats]) => ({
        client: getClient(clientId),
        ...stats,
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [filtered, getProject, getClient])

  const projectBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { hours: number; billableHours: number; revenue: number; expenses: number }
    >()
    for (const entry of filtered.entries) {
      const project = getProject(entry.projectId)
      if (!project) continue
      const existing = map.get(entry.projectId) ?? {
        hours: 0,
        billableHours: 0,
        revenue: 0,
        expenses: 0,
      }
      existing.hours += entry.duration
      if (entry.billable) {
        existing.billableHours += entry.duration
        existing.revenue += (entry.duration / 3600) * project.rate
      }
      map.set(entry.projectId, existing)
    }
    for (const expense of filtered.expenses) {
      const existing = map.get(expense.projectId) ?? {
        hours: 0,
        billableHours: 0,
        revenue: 0,
        expenses: 0,
      }
      existing.expenses += expense.amount
      map.set(expense.projectId, existing)
    }
    return Array.from(map.entries())
      .map(([projectId, stats]) => {
        const project = getProject(projectId)
        const client = project ? getClient(project.clientId) : undefined
        return { project, client, ...stats }
      })
      .sort((a, b) => b.revenue - a.revenue)
  }, [filtered, getProject, getClient])

  return (
    <>
      <PageHeader
        title="Reports"
        description="Financial summaries and breakdowns"
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="xs"
            onClick={() => setPreset("week")}
          >
            This Week
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => setPreset("month")}
          >
            This Month
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => setPreset("all")}
          >
            All Time
          </Button>
        </div>
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-6" />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="font-normal">
              <CalendarIcon className="size-4" data-icon="inline-start" />
              {format(range.from, "MMM d")} — {format(range.to, "MMM d, yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={{ from: range.from, to: range.to }}
              onSelect={(r) => {
                if (r?.from && r?.to) setRange({ from: r.from, to: r.to })
                else if (r?.from) setRange({ from: r.from, to: r.from })
              }}
              numberOfMonths={2}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold">
              {formatHours(totalHours)}h
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Billable</span>
                <span className="font-mono">{billablePercent.toFixed(0)}%</span>
              </div>
              <Progress value={billablePercent} className="h-1.5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(totalRevenue)}
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {formatHours(billableHours)}h billable
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {filtered.expenses.length} entries
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net Profit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "font-mono text-2xl font-bold",
                totalRevenue - totalExpenses >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              )}
            >
              {formatCurrency(totalRevenue - totalExpenses)}
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              after expenses
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="clients">
        <TabsList>
          <TabsTrigger value="clients">By Client</TabsTrigger>
          <TabsTrigger value="projects">By Project</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-4">
          <Card>
            {clientBreakdown.length === 0 ? (
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No data for this period
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Billable</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Expenses</TableHead>
                    <TableHead>Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientBreakdown.map((row) => (
                    <TableRow key={row.client?.id ?? "unknown"}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {row.client && (
                            <div
                              className="size-3 rounded-full"
                              style={{
                                backgroundColor: row.client.color,
                              }}
                            />
                          )}
                          <span className="font-medium">
                            {row.client?.name ?? "Unknown"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatHours(row.hours)}h
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatHours(row.billableHours)}h
                      </TableCell>
                      <TableCell className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(row.revenue)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-red-600 dark:text-red-400">
                        {formatCurrency(row.expenses)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-mono text-xs font-medium",
                          row.revenue - row.expenses >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        )}
                      >
                        {formatCurrency(row.revenue - row.expenses)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="projects" className="mt-4">
          <Card>
            {projectBreakdown.length === 0 ? (
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No data for this period
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Expenses</TableHead>
                    <TableHead>Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectBreakdown.map((row) => (
                    <TableRow key={row.project?.id ?? "unknown"}>
                      <TableCell className="font-medium">
                        {row.project?.name ?? "Unknown"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          {row.client && (
                            <div
                              className="size-2 rounded-full"
                              style={{
                                backgroundColor: row.client.color,
                              }}
                            />
                          )}
                          <span className="text-xs">
                            {row.client?.name ?? "—"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatHours(row.hours)}h
                      </TableCell>
                      <TableCell className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(row.revenue)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-red-600 dark:text-red-400">
                        {formatCurrency(row.expenses)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-mono text-xs font-medium",
                          row.revenue - row.expenses >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        )}
                      >
                        {formatCurrency(row.revenue - row.expenses)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}
