"use client"

import {
  Clock,
  DollarSign,
  FolderKanban,
  Receipt,
  TrendingUp,
  Users,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/page-header"
import { useStore } from "@/lib/store"
import { formatCurrency, formatHours } from "@/lib/format"
import { Badge } from "@/components/ui/badge"

export default function DashboardPage() {
  const { data, getClient, getProject } = useStore()

  const totalHours = data.timeEntries.reduce((sum, e) => sum + e.duration, 0)
  const billableEntries = data.timeEntries.filter((e) => e.billable)
  const billableHours = billableEntries.reduce((sum, e) => sum + e.duration, 0)

  const totalRevenue = billableEntries.reduce((sum, entry) => {
    const project = getProject(entry.projectId)
    if (!project) return sum
    return sum + (entry.duration / 3600) * project.rate
  }, 0)

  const totalExpenses = data.expenses.reduce((sum, e) => sum + e.amount, 0)

  const recentEntries = [...data.timeEntries]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8)

  const now = new Date()
  const thisWeekStart = new Date(now)
  thisWeekStart.setDate(now.getDate() - now.getDay())
  thisWeekStart.setHours(0, 0, 0, 0)

  const weekEntries = data.timeEntries.filter(
    (e) => new Date(e.date) >= thisWeekStart
  )
  const weekHours = weekEntries.reduce((sum, e) => sum + e.duration, 0)

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your time tracking activity"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Hours
            </CardTitle>
            <Clock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold">
              {formatHours(totalHours)}h
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {formatHours(weekHours)}h this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Billable Revenue
            </CardTitle>
            <DollarSign className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold">
              {formatCurrency(totalRevenue)}
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {formatHours(billableHours)}h billable
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Expenses
            </CardTitle>
            <Receipt className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {data.expenses.length} entries
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net Revenue
            </CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold">
              {formatCurrency(totalRevenue - totalExpenses)}
            </div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              after expenses
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Users className="size-4 text-muted-foreground" />
                  <span>Active Clients</span>
                </div>
                <span className="font-mono text-sm font-medium">
                  {data.clients.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <FolderKanban className="size-4 text-muted-foreground" />
                  <span>Active Projects</span>
                </div>
                <span className="font-mono text-sm font-medium">
                  {data.projects.filter((p) => p.status === "active").length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-muted-foreground" />
                  <span>Time Entries</span>
                </div>
                <span className="font-mono text-sm font-medium">
                  {data.timeEntries.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="size-4 text-muted-foreground" />
                  <span>Avg. Hourly Rate</span>
                </div>
                <span className="font-mono text-sm font-medium">
                  {data.projects.length > 0
                    ? formatCurrency(
                        data.projects.reduce((s, p) => s + p.rate, 0) /
                          data.projects.length
                      )
                    : "$0.00"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentEntries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No time entries yet. Start tracking!
              </p>
            ) : (
              <div className="space-y-3">
                {recentEntries.map((entry) => {
                  const project = getProject(entry.projectId)
                  const client = project
                    ? getClient(project.clientId)
                    : undefined
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {entry.description || "Untitled"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {project?.name}
                          {client && ` · ${client.name}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {entry.billable && (
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            $
                          </Badge>
                        )}
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatHours(entry.duration)}h
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
