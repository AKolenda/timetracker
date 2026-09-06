"use client"

import { Eye, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableRow, TableCell } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/format"
import type { InvoiceEstimate } from "@/lib/invoice-estimates"

const hoursLabel = (hours: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(hours)
const amberRow = "bg-amber-500/[0.07] hover:bg-amber-500/[0.11]"

export function InvoiceEstimateRow({ estimate, onReview, mobile = false }: { estimate: InvoiceEstimate; onReview: () => void; mobile?: boolean }) {
  if (mobile) return <button type="button" data-testid="invoice-estimate-row" onClick={onReview} className={`flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-md border border-amber-500/20 p-4 text-left focus-visible:outline-2 focus-visible:outline-amber-500 ${amberRow}`}>
    <FileText className="size-4 shrink-0 text-amber-700 dark:text-amber-300" />
    <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{estimate.clientName}</p><p className="mt-1 text-xs text-muted-foreground">Preview / {hoursLabel(estimate.hours)} h / Before tax</p></div>
    <div className="shrink-0 text-right"><p className="text-sm font-semibold tabular-nums text-amber-700 dark:text-amber-300">{formatCurrency(estimate.subtotal, estimate.currency)}</p><p className="text-xs text-muted-foreground">{estimate.currency}</p></div>
    <Eye className="size-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
  </button>
  return <TableRow data-testid="invoice-estimate-row" className={amberRow}>
    <TableCell><button type="button" onClick={onReview} className="inline-flex cursor-pointer items-center gap-2 rounded-md text-sm font-medium focus-visible:outline-2 focus-visible:outline-amber-500"><FileText className="size-4 text-amber-700 dark:text-amber-300" />Invoice preview</button></TableCell>
    <TableCell className="text-sm">{estimate.clientName}</TableCell>
    <TableCell className="text-xs text-muted-foreground">Today</TableCell>
    <TableCell className="text-xs text-muted-foreground">Not issued</TableCell>
    <TableCell className="text-sm font-medium tabular-nums text-amber-700 dark:text-amber-300">{formatCurrency(estimate.subtotal, estimate.currency)}<span className="ml-1 text-xs">{estimate.currency}</span><span className="block text-xs font-normal text-muted-foreground">Before tax</span></TableCell>
    <TableCell><span className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">Preview</span></TableCell>
    <TableCell><Button variant="ghost" size="icon-xs" aria-label={`Review invoice preview for ${estimate.clientName}`} title="Review preview" onClick={onReview} className="text-amber-700 dark:text-amber-300"><Eye className="size-3.5" /></Button></TableCell>
  </TableRow>
}

export function InvoiceEstimatePreview({ selected, onClose }: { selected: InvoiceEstimate | undefined; onClose: () => void }) {
  return (
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent data-testid="hypothetical-invoice" className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="pr-7"><DialogTitle>{selected?.clientName}</DialogTitle><DialogDescription>Hypothetical invoice · {selected?.currency}. Nothing has been created or sent.</DialogDescription></DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain divide-y rounded-md border">
          {selected?.items.map((item) => <div key={item.id} data-testid="estimate-line-item" className="flex min-w-0 items-start gap-3 p-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.description}</p><p className="break-words text-xs text-muted-foreground">{item.projectName}</p><p className="mt-1 text-xs text-muted-foreground">{item.date}{item.hours !== null ? ` / ${hoursLabel(item.hours)} h × ${formatCurrency(item.rate, selected.currency)}` : " / Expense"}</p></div><span className="shrink-0 text-sm tabular-nums">{formatCurrency(item.amount, selected.currency)}</span></div>)}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t pt-3"><span className="text-sm font-medium">Total before tax</span><span data-testid="estimate-total" className="text-lg font-semibold tabular-nums text-amber-800 dark:text-amber-300">{selected && formatCurrency(selected.subtotal, selected.currency)}</span></div>
        <div className="flex shrink-0 justify-end"><Button variant="outline" onClick={onClose}>Done</Button></div>
      </DialogContent>
    </Dialog>

  )
}
