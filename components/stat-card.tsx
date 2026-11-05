import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const toneClass = {
  default: "text-foreground",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  destructive: "text-destructive",
  info: "text-info",
} as const

interface StatCardProps {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  /** One short supporting line, such as "18.0h this week". */
  hint?: React.ReactNode
  /** Extra line under the value, such as a converted amount. */
  secondary?: React.ReactNode
  tone?: keyof typeof toneClass
  className?: string
}

/** The one metric tile used on every page: sans numerals, tabular figures, compact on phones. */
export function StatCard({ label, value, icon: Icon, hint, secondary, tone = "default", className }: StatCardProps) {
  return (
    <div data-slot="stat-card" className={cn("min-w-0 rounded-lg bg-card p-3 ring-1 ring-foreground/10 sm:p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
        {Icon && <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
      </div>
      <p className={cn("mt-1.5 truncate text-lg font-semibold tracking-tight tabular-nums sm:mt-2 sm:text-2xl", toneClass[tone])}>{value}</p>
      {secondary && <p className="truncate text-xs text-muted-foreground tabular-nums">{secondary}</p>}
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums sm:mt-1">{hint}</p>}
    </div>
  )
}

/** Two columns on phones, four on wide screens. */
export function StatGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4", className)}>{children}</div>
}
