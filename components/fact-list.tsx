import * as React from "react"

import { cn } from "@/lib/utils"

const toneClass = {
  default: "text-foreground",
  warning: "text-warning-foreground",
  destructive: "text-destructive",
  success: "text-success-foreground",
} as const

export type FactTone = keyof typeof toneClass

/**
 * A rounded box of `Fact` rows with a hairline between them. Use it for a
 * record's details or a handful of summary figures, on phones especially,
 * instead of a grid of uppercase labels stacked over values.
 */
export function FactBox({ className, children, ...props }: React.ComponentProps<"dl">) {
  return (
    <dl data-slot="fact-box" className={cn("divide-y rounded-lg border bg-card", className)} {...props}>
      {children}
    </dl>
  )
}

export interface FactProps {
  label: React.ReactNode
  value: React.ReactNode
  tone?: FactTone
  className?: string
}

/** One label-left, value-right row inside a `FactBox`. Labels stay sentence case. */
export function Fact({ label, value, tone = "default", className }: FactProps) {
  return (
    <div data-slot="fact" className={cn("flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm", className)}>
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 text-right font-medium break-words tabular-nums", toneClass[tone])}>{value}</dd>
    </div>
  )
}
