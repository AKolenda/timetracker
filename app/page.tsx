"use client"

import Link from "next/link"
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
import { useMoney } from "@/lib/display-currency"
import { formatCurrency, formatHours } from "@/lib/format"
import { billedSeconds } from "@/lib/billing"
import { Button } from "@/components/ui/button"
import { StatCard, StatGrid } from "@/components/stat-card"
import { Fact, FactBox } from "@/components/fact-list"
import { useExchangeRate } from "@/lib/use-exchange-rate"

export default function DashboardPage() {
  const { money, currency } = useMoney()
  const { data, getClient, getProject } = useStore()
  const displayCurrency = data.settings.displayCurrency
  const { rate } = useExchangeRate("USD", displayCurrency)

  const totalHours = data.timeEntries.reduce((sum, e) => sum + e.duration, 0)
  const billableEntries = data.timeEntries.filter((e) => e.billable)
  const billableHours = billableEntries.reduce((sum, e) => sum + e.duration, 0)

  const totalRevenue = billableEntries.reduce((sum, entry) => {
    const project = getProject(entry.projectId)
    if (!project) return sum
    return sum + (billedSeconds(entry) / 3600) * project.rate
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

  const converted = (amount: number) =>
    rate && displayCurrency !== currency
      ? `≈ ${formatCurrency(amount * rate, displayCurrency)}`
      : undefined

  const quickStats = [
    { label: "Active clients", icon: Users, value: data.clients.length },
    { label: "Active projects", icon: FolderKanban, value: data.projects.filter((p) => p.status === "active").length },
    { label: "Time entries", icon: Clock, value: data.timeEntries.length },
    {
      label: "Avg. hourly rate",
      icon: TrendingUp,
      value: money(
        data.projects.length > 0
          ? data.projects.reduce((s, p) => s + p.rate, 0) / data.projects.length
          : 0
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Dashboard"
      />

      <StatGrid>
        <StatCard
          label="Total hours"
          icon={Clock}
          value={`${formatHours(totalHours)}h`}
          hint={`${formatHours(weekHours)}h this week`}
        />
        <StatCard
          label="Billable revenue"
          icon={DollarSign}
          value={money(totalRevenue)}
          secondary={converted(totalRevenue)}
          hint={`${formatHours(billableHours)}h billable`}
        />
        <StatCard
          label="Expenses"
          icon={Receipt}
          value={money(totalExpenses)}
          hint={`${data.expenses.length} ${data.expenses.length === 1 ? "entry" : "entries"}`}
        />
        <StatCard
          label="Total payout"
          icon={TrendingUp}
          value={money(totalRevenue + totalExpenses)}
          secondary={converted(totalRevenue + totalExpenses)}
          hint="Revenue + expenses"
        />
      </StatGrid>

      <div className="mt-3 grid grid-cols-1 items-start gap-3 sm:mt-6 sm:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="phone-flat max-sm:gap-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Quick stats</CardTitle>
          </CardHeader>
          <CardContent>
            {/* A fact box on phones; from sm up the card itself is the box. */}
            <FactBox className="sm:rounded-none sm:border-0 sm:bg-transparent">
              {quickStats.map(({ label, icon: Icon, value }) => (
                <Fact
                  key={label}
                  className="sm:items-center sm:px-0 sm:first:pt-0 sm:last:pb-0 sm:[&>dt]:text-foreground"
                  label={
                    <span className="flex items-center gap-2">
                      <Icon aria-hidden className="size-4 text-muted-foreground max-sm:hidden" />
                      {label}
                    </span>
                  }
                  value={value}
                />
              ))}
            </FactBox>
          </CardContent>
        </Card>

        <Card className="phone-flat max-sm:gap-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentEntries.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center max-sm:rounded-lg max-sm:border max-sm:bg-card">
                <p className="text-sm text-muted-foreground">No time entries yet.</p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/tracker">Open the tracker</Link>
                </Button>
              </div>
            ) : (
              /* On phones the list is its own bordered box of house rows, like Quick stats. */
              <ul className="divide-y max-sm:rounded-lg max-sm:border max-sm:bg-card">
                {recentEntries.map((entry) => {
                  const project = getProject(entry.projectId)
                  const client = project
                    ? getClient(project.clientId)
                    : undefined
                  const amount = entry.billable && project
                    ? (billedSeconds(entry) / 3600) * project.rate
                    : null
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 py-2.5 max-sm:px-4 sm:first:pt-0 sm:last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {entry.description || "Untitled"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {project?.name ?? "No project"}
                          {client && ` · ${client.name}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium tabular-nums">
                          {formatHours(entry.duration)}h
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {amount !== null ? money(amount) : entry.billable ? "Billable" : "Non-billable"}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
