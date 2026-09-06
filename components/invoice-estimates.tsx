"use client"

import { useState } from "react"
import { Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency } from "@/lib/format"
import type { InvoiceEstimate } from "@/lib/invoice-estimates"

const PAGE_SIZE = 4
const hoursLabel = (hours: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(hours)

export function InvoiceEstimates({ estimates }: { estimates: InvoiceEstimate[] }) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = estimates.find((estimate) => estimate.id === selectedId)
  const filtered = estimates.filter((estimate) => estimate.clientName.toLowerCase().includes(search.toLowerCase().trim()))
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  if (!estimates.length) return null
  return <>
    <Card data-testid="invoice-estimates" className="mb-5 border-amber-500/30 bg-amber-500/[0.05]">
      <CardContent className="pt-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-sm font-medium text-amber-800 dark:text-amber-300">If you invoiced today</h2><p className="mt-1 text-xs text-muted-foreground">Unbilled work and expenses. Previews only, before tax.</p></div>
          {estimates.length > PAGE_SIZE && <Input aria-label="Find an invoice preview" placeholder="Find a client…" className="h-8 w-full sm:w-52" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} />}
        </div>
        <div className="divide-y divide-amber-500/20">
          {filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((estimate) => <button key={estimate.id} type="button" data-testid="invoice-estimate-row" onClick={() => setSelectedId(estimate.id)} className="flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-md px-1 py-3 text-left hover:bg-amber-500/10 focus-visible:outline-2 focus-visible:outline-amber-500">
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{estimate.clientName}</p><p className="mt-0.5 text-xs text-muted-foreground">{hoursLabel(estimate.hours)} {estimate.hours === 1 ? "hour" : "hours"}{estimate.expenses ? ` + ${formatCurrency(estimate.expenses, estimate.currency)} expenses` : ""}</p></div>
            <div className="shrink-0 text-right"><p className="text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-300">{formatCurrency(estimate.subtotal, estimate.currency)}</p><p className="text-xs text-muted-foreground">{estimate.currency}</p></div><Eye className="size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          </button>)}
          {!filtered.length && <p className="py-3 text-sm text-muted-foreground">No unbilled work matches this client.</p>}
        </div>
        {estimates.length > PAGE_SIZE && <div className="mt-2 flex items-center justify-between border-t border-amber-500/20 pt-2"><p className="text-xs text-muted-foreground">Page {currentPage + 1} of {pages}</p><div className="flex gap-1"><Button variant="ghost" size="sm" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</Button><Button variant="ghost" size="sm" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</Button></div></div>}
      </CardContent>
    </Card>
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null) }}>
      <DialogContent data-testid="hypothetical-invoice" className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="pr-7"><DialogTitle>{selected?.clientName}</DialogTitle><DialogDescription>Hypothetical invoice · {selected?.currency}. Nothing has been created or sent.</DialogDescription></DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain divide-y rounded-md border">
          {selected?.items.map((item) => <div key={item.id} data-testid="estimate-line-item" className="flex min-w-0 items-start gap-3 p-3"><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{item.description}</p><p className="break-words text-xs text-muted-foreground">{item.projectName}</p><p className="mt-1 text-xs text-muted-foreground">{item.date}{item.hours !== null ? ` / ${hoursLabel(item.hours)} h × ${formatCurrency(item.rate, selected.currency)}` : " / Expense"}</p></div><span className="shrink-0 text-sm tabular-nums">{formatCurrency(item.amount, selected.currency)}</span></div>)}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t pt-3"><span className="text-sm font-medium">Total before tax</span><span data-testid="estimate-total" className="text-lg font-semibold tabular-nums text-amber-800 dark:text-amber-300">{selected && formatCurrency(selected.subtotal, selected.currency)}</span></div>
        <div className="flex shrink-0 justify-end"><Button variant="outline" onClick={() => setSelectedId(null)}>Done</Button></div>
      </DialogContent>
    </Dialog>
  </>
}
