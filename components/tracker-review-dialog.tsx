"use client"

import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const PAGE_SIZE = 6

export function TrackerReviewDialog({ open, onOpenChange, title, description, items, emptyText, actions }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  items: { id: string; searchText: string; content: ReactNode }[]
  emptyText: string
  actions?: ReactNode
}) {
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const filtered = items.filter((item) => item.searchText.toLowerCase().includes(query.toLowerCase().trim()))
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1)
  const currentPage = Math.min(page, lastPage)
  return <Dialog open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) { setQuery(""); setPage(0) } }}>
    <DialogContent className="flex max-h-[85dvh] flex-col gap-3 overflow-hidden sm:max-w-2xl">
      <DialogHeader className="pr-8"><DialogTitle>{title}</DialogTitle><DialogDescription className="max-w-prose">{description}</DialogDescription></DialogHeader>
      <Input aria-label={`Search ${title.toLowerCase()}`} placeholder="Search by project, client, or date…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} className="shrink-0" />
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      <div data-testid="review-modal-list" className="min-h-0 overflow-y-auto overscroll-contain divide-y rounded-md border">
        {filtered.length ? filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((item) => <div key={item.id} className="min-w-0 p-3">{item.content}</div>) : <p className="p-6 text-center text-sm text-muted-foreground">{query ? "No matching items. Try another search." : emptyText}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">{filtered.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of ${filtered.length}` : "0 items"}</p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button>
          <Button variant="ghost" size="sm" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next</Button>
          <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); setQuery(""); setPage(0) }}>Done</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
}
