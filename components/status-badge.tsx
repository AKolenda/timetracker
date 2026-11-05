import type { Invoice, Project } from "@/lib/types"
import { cn } from "@/lib/utils"

/** One meaning per status across invoices, calendar, reports and client detail. */
export const invoiceStatusStyles: Record<Invoice["status"], string> = {
  draft: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  sent: "bg-info/10 text-info",
  paid: "bg-success/10 text-success-foreground",
  overdue: "bg-destructive/10 text-destructive",
}

export const invoiceStatusDots: Record<Invoice["status"], string> = {
  draft: "bg-muted-foreground/60",
  sent: "bg-info",
  paid: "bg-success",
  overdue: "bg-destructive",
}

export const invoiceStatusLabels: Record<Invoice["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
}

export const projectStatusStyles: Record<Project["status"], string> = {
  active: "bg-success/10 text-success-foreground",
  completed: "bg-info/10 text-info",
  "on-hold": "bg-warning/15 text-warning-foreground",
}

export const projectStatusLabels: Record<Project["status"], string> = {
  active: "Active",
  completed: "Completed",
  "on-hold": "On hold",
}

const base = "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium whitespace-nowrap"

export function InvoiceStatusBadge({ status, className }: { status: Invoice["status"]; className?: string }) {
  return (
    <span className={cn(base, invoiceStatusStyles[status], className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", invoiceStatusDots[status])} />
      {invoiceStatusLabels[status]}
    </span>
  )
}

export function ProjectStatusBadge({ status, className }: { status: Project["status"]; className?: string }) {
  return <span className={cn(base, projectStatusStyles[status], className)}>{projectStatusLabels[status]}</span>
}
