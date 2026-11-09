"use client"

import { Eye, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableRow, TableCell } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useMoney } from "@/lib/display-currency"
import { formatCurrency } from "@/lib/format"
import type { InvoiceEstimate } from "@/lib/invoice-estimates"

const hoursLabel = (hours: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(hours)
// A quiet warning tint with a thin accent edge, so previews stand apart in the desktop table.
const previewRow = "bg-warning/[0.05] shadow-[inset_2px_0_0_var(--warning)] hover:bg-warning/10"
const previewChip = "inline-flex h-5 items-center rounded-md bg-warning/15 px-1.5 text-xs font-medium whitespace-nowrap text-warning-foreground"

export function InvoiceEstimateRow({ estimate, onReview, mobile = false }: { estimate: InvoiceEstimate; onReview: () => void; mobile?: boolean }) {
  // Issued rows show amounts in the display currency with no code, so only name a currency that differs from it.
  const { currency: displayCurrency } = useMoney()
  const currencyCode = estimate.currency !== displayCurrency ? estimate.currency : null
  // A row in the phone/tablet invoice list, laid out like the invoice rows under it: client, chip and
  // amount on line 1, hours on line 2, and the eye in the same 44px slot as their ⋯. The tint marks it.
  if (mobile) return <button type="button" data-testid="invoice-estimate-row" onClick={onReview} aria-label={`Review invoice preview for ${estimate.clientName}`} className="flex w-full min-w-0 cursor-pointer items-center gap-1 bg-warning/[0.05] pr-0.5 pl-4 text-left hover:bg-warning/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset">
    <span className="min-w-0 flex-1 py-2.5">
      <span className="flex min-w-0 items-center gap-2"><span className="min-w-0 truncate text-sm font-medium">{estimate.clientName}</span><span className={previewChip}>Preview</span><span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(estimate.subtotal, estimate.currency)}</span></span>
      <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><span className="min-w-0 flex-1 truncate tabular-nums">{hoursLabel(estimate.hours)}h<span className="max-sm:sr-only"> · Before tax</span></span>{currencyCode && <span className="shrink-0">{currencyCode}</span>}</span>
    </span>
    <span aria-hidden className="flex size-11 shrink-0 items-center justify-center text-muted-foreground"><Eye className="size-4" /></span>
  </button>
  return <TableRow data-testid="invoice-estimate-row" className={previewRow}>
    <TableCell><button type="button" onClick={onReview} className="inline-flex cursor-pointer items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><FileText aria-hidden className="size-4 text-warning-foreground" />Not issued</button></TableCell>
    <TableCell className="text-sm">{estimate.clientName}</TableCell>
    <TableCell className="text-sm text-muted-foreground">Today</TableCell>
    <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">—</TableCell>
    <TableCell className="text-right text-sm font-medium tabular-nums">{formatCurrency(estimate.subtotal, estimate.currency)}{currencyCode && <span className="ml-1 text-xs font-normal text-muted-foreground">{currencyCode}</span>}<span className="block text-xs font-normal text-muted-foreground">Before tax</span></TableCell>
    <TableCell><span className={previewChip}>Preview</span></TableCell>
    <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-xs" aria-label={`Review invoice preview for ${estimate.clientName}`} title="Review preview" onClick={onReview}><Eye className="size-3.5" /></Button>{/* Keeps the eye under the issued rows' Preview button, which sits beside a menu. */}<span aria-hidden className="size-6 shrink-0 pointer-coarse:size-9" /></div></TableCell>
  </TableRow>
}

export function InvoiceEstimatePreview({ selected, onClose }: { selected: InvoiceEstimate | undefined; onClose: () => void }) {
  return (
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent data-testid="hypothetical-invoice" className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="pr-7"><DialogTitle>{selected?.clientName}</DialogTitle><DialogDescription>Hypothetical invoice · {selected?.currency}. Nothing has been created or sent.</DialogDescription></DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain divide-y rounded-md border">
          {selected?.items.map((item) => <div key={item.id} data-testid="estimate-line-item" className="flex min-w-0 items-start gap-3 p-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.description}</p><p className="break-words text-xs text-muted-foreground">{item.projectName}</p><p className="mt-1 text-xs text-muted-foreground">{item.date}{item.hours !== null ? ` · ${hoursLabel(item.hours)}h × ${formatCurrency(item.rate, selected.currency)}` : " · Expense"}</p></div><span className="shrink-0 text-right text-sm tabular-nums">{formatCurrency(item.amount, selected.currency)}</span></div>)}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t pt-3"><span className="text-sm font-medium">Total before tax</span><span data-testid="estimate-total" className="text-lg font-semibold tabular-nums">{selected && formatCurrency(selected.subtotal, selected.currency)}</span></div>
        <div className="flex shrink-0 justify-end"><Button variant="outline" onClick={onClose}>Done</Button></div>
      </DialogContent>
    </Dialog>

  )
}
