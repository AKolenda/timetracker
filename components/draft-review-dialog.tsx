"use client"

import { useRef, useState, type ReactNode } from "react"
import { format } from "date-fns"
import { formatClock, formatTimeRange as timeRange } from "@/lib/format"
import { Check, ChevronLeft, ChevronRight, Pencil, Search, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const PAGE_SIZE = 15

export interface DraftReviewItem {
  id: string
  start: number
  end: number
  durationSeconds: number
  /** Plain title, for the hover tooltip. */
  title: string
  /** The clickable title that opens the draft's chats. */
  titleNode: ReactNode
  /** Project and machine, e.g. "ASCEND · Coding VM". */
  meta: string
  amount: string
  /** Billed time when a chat bills at less than 100%. */
  billed?: ReactNode
  searchText: string
}

const amberCheckbox = "data-checked:border-warning data-checked:bg-warning data-checked:text-amber-950 dark:data-checked:bg-warning aria-[checked=mixed]:border-warning aria-[checked=mixed]:bg-warning aria-[checked=mixed]:[&_svg]:hidden aria-[checked=mixed]:before:h-0.5 aria-[checked=mixed]:before:w-2 aria-[checked=mixed]:before:rounded-full aria-[checked=mixed]:before:bg-amber-950 aria-[checked=mixed]:before:content-['']"

export function DraftReviewDialog({ open, onOpenChange, items, totalSeconds, busy, onApprove, onSkip, onEdit, onApproveAll }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Newest first. */
  items: DraftReviewItem[]
  totalSeconds: number
  busy: boolean
  onApprove: (ids: string[]) => void
  onSkip: (ids: string[]) => void
  onEdit: (id: string) => void
  onApproveAll: () => void
}) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const titleRef = useRef<HTMLHeadingElement>(null)
  // These dialogs open from plain buttons rather than a DialogTrigger, so Radix has nowhere to send focus on close.
  const openerRef = useRef<HTMLElement | null>(null)

  const needle = query.trim().toLowerCase()
  const filtered = needle ? items.filter((item) => item.searchText.toLowerCase().includes(needle)) : items
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  const shown = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
  // Approved or skipped drafts drop out of `items`, so they drop out of the selection too.
  const selected = items.filter((item) => picked.has(item.id))
  const selectedSeconds = selected.reduce((total, item) => total + item.durationSeconds, 0)

  const days: { label: string; items: DraftReviewItem[] }[] = []
  for (const item of shown) {
    const label = format(new Date(item.start), "EEEE, MMM d")
    if (days.at(-1)?.label === label) days.at(-1)!.items.push(item)
    else days.push({ label, items: [item] })
  }

  function toggle(ids: string[], on: boolean) {
    setPicked((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  function act(run: (ids: string[]) => void, ids: string[]) {
    run(ids)
    toggle(ids, false)
  }

  function close(value: boolean) {
    onOpenChange(value)
    if (!value) { setQuery(""); setPage(0); setPicked(new Set()) }
  }

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl" data-testid="draft-review-dialog" onOpenAutoFocus={(event) => { event.preventDefault(); openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; titleRef.current?.focus() }} onCloseAutoFocus={(event) => { if (openerRef.current?.isConnected) { event.preventDefault(); openerRef.current.focus() } }}>
      <DialogHeader className="shrink-0 flex-row items-baseline gap-2 border-b px-4 py-3 pr-12 text-left">
        <DialogTitle ref={titleRef} tabIndex={-1} className="rounded-md text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">Review drafts</DialogTitle>
        <span className="text-xs text-muted-foreground tabular-nums">{items.length} · {formatClock(totalSeconds)}</span>
        <DialogDescription className="sr-only">Approve or skip agent drafts. Skipped time can be restored in Import settings.</DialogDescription>
      </DialogHeader>
      <label className="mx-4 mt-3 flex h-8 shrink-0 items-center gap-2 rounded-md border px-2.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/50">
        <Search className="size-3.5 shrink-0" />
        <input className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground sm:text-sm" aria-label="Search drafts" placeholder="Search by title, project, or date…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} />
      </label>
      <div className="mx-4 mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border" data-testid="review-modal-list">
        {days.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">{needle ? "No drafts match this search." : "No drafts left to review."}</p>}
        {days.map((day) => {
          const ids = day.items.map((item) => item.id)
          const on = ids.filter((id) => picked.has(id)).length
          return <section key={`${day.label}-${ids[0]}`} aria-label={day.label}>
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              <Checkbox aria-label={`Select all drafts on ${day.label}`} className={amberCheckbox} checked={on === ids.length ? true : on ? "indeterminate" : false} onCheckedChange={(value) => toggle(ids, value === true)} />
              <span className="min-w-0 flex-1 truncate">{day.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{ids.length} {ids.length === 1 ? "draft" : "drafts"} · {formatClock(day.items.reduce((total, item) => total + item.durationSeconds, 0))}</span>
            </div>
            {day.items.map((item) => {
              const isOn = picked.has(item.id)
              const when = timeRange(item.start, item.end)
              return <div key={item.id} data-testid="draft-review-row" className={`group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b px-3 py-2 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_8.5rem_4.5rem_4rem_auto] ${isOn ? "bg-warning/[0.08]" : "hover:bg-muted/40"}`}>
                <Checkbox aria-label={`Select ${item.title}`} className={amberCheckbox} checked={isOn} onCheckedChange={(value) => toggle([item.id], value === true)} />
                <div className="min-w-0" title={item.title}>
                  <div className="text-sm font-medium [&_[data-testid=entry-chat-menu]>span:first-child]:truncate">{item.titleNode}</div>
                  <p className="truncate text-xs text-muted-foreground">{item.meta}</p>
                  <p className="text-xs text-muted-foreground tabular-nums sm:hidden">{when} · <span className="text-warning-foreground">{formatClock(item.durationSeconds)}</span>{item.amount ? ` · ${item.amount}` : ""}</p>
                </div>
                <span className="hidden text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:block">{when}</span>
                <span className="hidden text-right text-xs text-warning-foreground tabular-nums sm:block">{formatClock(item.durationSeconds)}{item.billed}</span>
                <span className="hidden text-right text-xs text-muted-foreground tabular-nums sm:block">{item.amount || "—"}</span>
                <div className="flex items-center gap-0.5 sm:opacity-50 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                  <Button variant="ghost" size="icon-xs" data-testid="review-approve-draft" disabled={busy} aria-label="Approve" title="Approve" className="text-warning-foreground hover:bg-warning/20 hover:text-warning-foreground" onClick={() => act(onApprove, [item.id])}><Check className="size-3.5" /></Button>
                  <Button variant="ghost" size="icon-xs" aria-label="Edit and approve" title="Edit and approve" onClick={() => onEdit(item.id)}><Pencil className="size-3.5" /></Button>
                  <Button variant="ghost" size="icon-xs" data-testid="review-skip-draft" aria-label="Skip" title="Skip" onClick={() => act(onSkip, [item.id])}><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
            })}
          </section>
        })}
      </div>
      <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground" data-testid="draft-review-footer">
        {selected.length > 0 ? <>
          <span className="text-sm text-foreground tabular-nums">{selected.length} selected · {formatClock(selectedSeconds)}</span>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>Clear</Button>
          <Button variant="outline" size="sm" data-testid="review-skip-selected" onClick={() => act(onSkip, selected.map((item) => item.id))}><Trash2 className="size-3.5" data-icon="inline-start" />Skip {selected.length}</Button>
          <Button size="sm" data-testid="review-approve-selected" disabled={busy} className="bg-warning text-amber-950 hover:bg-warning/85" onClick={() => act(onApprove, selected.map((item) => item.id))}><Check className="size-3.5" data-icon="inline-start" />Approve {selected.length}</Button>
        </> : <>
          <span className="tabular-nums">{filtered.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}` : "0 drafts"}</span>
          <Button variant="ghost" size="icon-xs" aria-label="Previous page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="size-3.5" /></Button>
          <Button variant="ghost" size="icon-xs" aria-label="Next page" disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}><ChevronRight className="size-3.5" /></Button>
          <span className="flex-1" />
          {items.length > 0 && <Button size="sm" data-testid="review-approve-all" disabled={busy} className="bg-warning text-amber-950 hover:bg-warning/85" onClick={onApproveAll}><Check className="size-3.5" data-icon="inline-start" />Approve all {items.length} · <span className="tabular-nums">{formatClock(totalSeconds)}</span></Button>}
        </>}
      </div>
    </DialogContent>
  </Dialog>
}
