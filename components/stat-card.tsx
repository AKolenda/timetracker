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

/**
 * The one metric tile used on every page: sans numerals, tabular figures.
 * Put tiles in a `StatGrid`; on phones they fold into a compact two-column
 * strip (no icon or hint), and from `sm` up they are separate cards.
 */
export function StatCard({ label, value, icon: Icon, hint, secondary, tone = "default", className }: StatCardProps) {
  return (
    <div data-slot="stat-card" className={cn("min-w-0 rounded-lg bg-card p-3 ring-1 ring-foreground/10 sm:p-4 max-sm:rounded-none max-sm:px-3 max-sm:py-2 max-sm:shadow-none max-sm:ring-0", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
        {Icon && <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground max-sm:hidden" />}
      </div>
      <p className={cn("mt-1.5 truncate text-lg font-semibold tracking-tight tabular-nums max-sm:mt-0.5 max-sm:text-base sm:mt-2 sm:text-2xl", toneClass[tone])}>{value}</p>
      {secondary && <p className="truncate text-xs text-muted-foreground tabular-nums">{secondary}</p>}
      {hint && <p className="mt-0.5 max-sm:hidden truncate text-xs text-muted-foreground tabular-nums sm:mt-1">{hint}</p>}
    </div>
  )
}

/**
 * Holds `StatCard`s: one bordered two-column strip with hairlines on phones,
 * separate cards in two columns from `sm` and four on wide screens.
 */
export function StatGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      data-slot="stat-grid"
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4",
        // Hairlines come from a 1px gap over the border colour, so no edge doubles up;
        // an odd last tile spans both columns so no empty cell shows.
        "max-sm:gap-px max-sm:overflow-hidden max-sm:rounded-lg max-sm:border max-sm:bg-border max-sm:[&>:last-child:nth-child(odd)]:col-span-2",
        // Any tile, not just a StatCard, sits flat inside the strip: no corners, ring or border of its own.
        "max-sm:*:rounded-none max-sm:*:border-0 max-sm:*:shadow-none max-sm:*:ring-0",
        className
      )}
    >
      {children}
    </div>
  )
}
