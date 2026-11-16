"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { ChevronRight, Eye, FileText, SquarePen, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { TableRow, TableCell } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InvoiceChat, type ChatMessage, type ProposalImpact } from "@/components/invoice-chat"
import { useMoney } from "@/lib/display-currency"
import { formatCurrency } from "@/lib/format"
import { buildInvoiceEstimates, type EstimateLine, type InvoiceEstimate } from "@/lib/invoice-estimates"
import { lineDates } from "@/lib/invoice-lines"
import { applyProposal, emptyProposal, type ChatEntry, type ChatSuggestion, type InvoiceProposal } from "@/lib/invoice-chat"
import { skipEntryAgentTime, unskipAgentRanges } from "@/lib/agent-skips"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Expense, TimeEntry } from "@/lib/types"

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
      <span className="flex min-w-0 items-center gap-2"><span className="min-w-0 truncate text-sm font-medium">{estimate.clientName}</span><span className={previewChip}>Preview</span><span className="ml-auto shrink-0 text-sm font-semibold tabular-nums max-sm:font-medium">{formatCurrency(estimate.subtotal, estimate.currency)}</span></span>
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

/** What a change needs to be taken back: values before it, deleted rows, and skips it added. */
type Undo = { restore: { ids: string[]; updates: Partial<TimeEntry> }[]; deleted: TimeEntry[]; expenses: Expense[]; skips: string[] }

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : word === "entry" ? "entries" : `${word}s`}`

/** Applies proposals and line deletes through the store, so every page sees them at once. */
function useEntryEdits() {
  const { data, updateTimeEntries, deleteTimeEntries, addTimeEntry, addExpense, deleteExpense } = useStore()

  async function apply(proposal: InvoiceProposal, expenseIds: string[] = []): Promise<Undo> {
    const byId = new Map(data.timeEntries.map((entry) => [entry.id, entry]))
    const removed = new Set(proposal.delete)
    const renamed = new Set(proposal.rename.map((change) => change.entryId))
    const touched = [...new Set([...proposal.ungroup, ...proposal.group.flatMap((group) => group.entryIds), ...proposal.billFactor.flatMap((change) => change.entryIds), ...renamed])]
      .filter((id) => !removed.has(id)).map((id) => byId.get(id)).filter((entry): entry is TimeEntry => Boolean(entry))
    // Group identical "before" values so undo takes as few requests as the change did.
    const before = new Map<string, { ids: string[]; updates: Partial<TimeEntry> }>()
    for (const entry of touched) {
      const updates: Partial<TimeEntry> = { invoiceLine: entry.invoiceLine ?? null, billFactor: entry.billFactor ?? 1, ...(renamed.has(entry.id) ? { description: entry.description } : {}) }
      const key = renamed.has(entry.id) ? entry.id : JSON.stringify(updates)
      before.set(key, { ids: [...(before.get(key)?.ids ?? []), entry.id], updates })
    }
    const live = (ids: string[]) => ids.filter((id) => byId.has(id))
    // Labels first, then factors and names, since an entry can be in more than one of these.
    await Promise.all([updateTimeEntries(live(proposal.ungroup), { invoiceLine: null }), ...proposal.group.map((group) => updateTimeEntries(live(group.entryIds), { invoiceLine: group.label }))])
    await Promise.all(proposal.billFactor.map((change) => updateTimeEntries(live(change.entryIds), { billFactor: change.factor })))
    await Promise.all(proposal.rename.map((change) => updateTimeEntries(live([change.entryId]), { description: change.description })))
    const deleted = proposal.delete.map((id) => byId.get(id)).filter((entry): entry is TimeEntry => Boolean(entry))
    const skips = skipEntryAgentTime(deleted, data.projects)
    await deleteTimeEntries(deleted.map((entry) => entry.id))
    const expenses = data.expenses.filter((expense) => expenseIds.includes(expense.id))
    for (const expense of expenses) await deleteExpense(expense.id)
    return { restore: [...before.values()], deleted, expenses, skips }
  }

  async function undo(change: Undo) {
    await Promise.all(change.restore.map(({ ids, updates }) => updateTimeEntries(ids.filter((id) => data.timeEntries.some((entry) => entry.id === id)), updates)))
    for (const entry of change.deleted) {
      const { id: _id, ...rest } = entry
      void _id
      await addTimeEntry({ ...rest, agentTimeTitleStatus: null })
    }
    for (const expense of change.expenses) {
      const { id: _id, ...rest } = expense
      void _id
      await addExpense(rest)
    }
    unskipAgentRanges(change.skips)
  }

  return { apply, undo }
}

const timeRange = (entry: TimeEntry) => `${format(new Date(entry.startTime), "HH:mm")}${entry.endTime ? `–${format(new Date(entry.endTime), "HH:mm")}` : ""}`

function chatEntries(estimate: InvoiceEstimate): ChatEntry[] {
  return estimate.lines.flatMap((line) => line.entries.map((entry) => ({
    id: entry.id,
    projectId: line.projectId,
    projectName: line.projectName,
    rate: line.rate,
    date: entry.date,
    time: timeRange(entry),
    duration: entry.duration,
    billFactor: entry.billFactor ?? 1,
    description: entry.description,
    invoiceLine: entry.invoiceLine ?? null,
    chats: [...new Set((entry.agentTimeSources ?? []).map((source) => source.conversationTitle.trim()).filter(Boolean))].slice(0, 3).map((title) => title.slice(0, 80)),
  }))).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
}

/** Openers drawn from what this client's entries actually look like. */
function starters(estimate: InvoiceEstimate): ChatSuggestion[] {
  const entries = estimate.lines.flatMap((line) => line.entries)
  const days = new Set(entries.map((entry) => entry.date)).size
  const tiny = entries.filter((entry) => entry.duration < 120).length
  const blocks = entries.filter((entry) => entry.duration === 1800 && (entry.billFactor ?? 1) === 1).length
  const list: ChatSuggestion[] = []
  if (estimate.lines.length > days) list.push({ label: "One line per day", prompt: "Group these entries into one line per day, each with a short summary of that day's work." })
  if (tiny) list.push({ label: tiny === 1 ? "Delete the tiny entry" : `Delete ${tiny} tiny entries`, prompt: "Delete the entries under 2 minutes." })
  if (blocks) list.push({ label: "Charge half for agent blocks", prompt: "Charge half for the 30-minute Agent Time blocks." })
  list.push({ label: "Explain the total", prompt: "What makes up this total? Which days and kinds of work cost the most?" })
  return list
}

function LineRow({ line, currency, fresh, indent, editable, onDelete }: { line: EstimateLine; currency: string; fresh: boolean; indent: boolean; editable: boolean; onDelete: (line: EstimateLine, entry?: TimeEntry) => void }) {
  const [open, setOpen] = useState(false)
  const grouped = line.entries.length > 1
  const meta = line.hours === null ? "Expense" : `${hoursLabel(line.hours)}h × ${formatCurrency(line.rate, currency)}${grouped ? ` · ${line.entries.length} entries` : ""}`
  const what = grouped ? `${line.entries.length} entries in ${line.description}` : line.description
  return (
    <li data-testid="estimate-line-item" className={cn("group/line border-b last:border-b-0", fresh && "bg-primary/[0.07]")}>
      <div className={cn("flex min-h-14 items-center gap-1.5 py-2 pr-2 sm:pr-3", indent ? "pl-2" : "pl-4")}>
        {grouped
          ? <Button type="button" variant="ghost" size="icon-xs" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} the ${line.entries.length} entries`} onClick={() => setOpen(!open)}><ChevronRight className={cn("transition-transform motion-reduce:transition-none", open && "rotate-90")} /></Button>
          : indent && <span aria-hidden className="size-6 shrink-0 pointer-coarse:size-11" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm" title={line.description}>{line.description}</p>
          <p className="truncate text-xs text-muted-foreground tabular-nums">{lineDates(line.firstDate, line.lastDate)} · {meta}</p>
        </div>
        <span className="shrink-0 text-right text-sm tabular-nums">{formatCurrency(line.amount, currency)}</span>
        {editable
          ? <Button type="button" variant="ghost" size="icon-xs" aria-label={`Delete ${what}`} title={grouped ? `Delete these ${line.entries.length} entries` : "Delete"} className="text-muted-foreground hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover/line:opacity-100" onClick={() => onDelete(line)}><Trash2 /></Button>
          : <span aria-hidden className="size-6 shrink-0 pointer-coarse:size-11" />}
      </div>
      {grouped && open && (
        <ul className="pb-2 pl-10 pr-2 sm:pr-3">
          {line.entries.map((entry) => (
            <li key={entry.id} className="group/entry flex min-h-8 items-center gap-2 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1 truncate text-foreground" title={entry.description}>{entry.description || "Time entry"}</span>
              <span className="shrink-0 tabular-nums">{format(new Date(entry.startTime), "MMM d, HH:mm")}</span>
              <span className="w-12 shrink-0 text-right tabular-nums">{hoursLabel(entry.seconds / 3600)}h</span>
              {editable
                ? <Button type="button" variant="ghost" size="icon-xs" aria-label={`Delete ${entry.description || "entry"}`} title="Delete" className="text-muted-foreground hover:text-destructive focus-visible:opacity-100 md:opacity-0 md:group-hover/entry:opacity-100" onClick={() => onDelete(line, entry)}><Trash2 /></Button>
                : <span aria-hidden className="size-6 shrink-0 pointer-coarse:size-11" />}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export function InvoiceEstimatePreview({ selected, onClose, onCreateInvoice }: { selected: InvoiceEstimate | undefined; onClose: () => void; onCreateInvoice?: (estimate: InvoiceEstimate) => void }) {
  const { data } = useStore()
  const edits = useEntryEdits()
  // Chats live for the page visit, per client and currency, so closing the preview keeps them.
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({})
  const [tab, setTab] = useState<"lines" | "chat">("lines")
  const [showCurrent, setShowCurrent] = useState(false)
  // The last delete, undone from a bar inside the dialog: a toast's button can't be clicked while it's open.
  const [lastDelete, setLastDelete] = useState<{ label: string; change: Undo } | null>(null)
  const [undos, setUndos] = useState<Record<string, Undo>>({})
  // Kept while the dialog animates closed, so it doesn't flash empty.
  const [lastSelected, setLastSelected] = useState(selected)
  if (selected && selected !== lastSelected) setLastSelected(selected)
  const estimate = selected ?? lastSelected

  const messages = useMemo(() => (estimate ? threads[estimate.id] ?? [] : []), [threads, estimate])
  const pending = [...messages].reverse().find((message) => message.role === "assistant" && (message.proposalState === "pending" || message.proposalState === "applying"))
  const pendingProposal = pending?.role === "assistant" ? pending.proposal ?? null : null
  const [shownFor, setShownFor] = useState<string | null>(null)
  if ((pending?.id ?? null) !== shownFor) {
    setShownFor(pending?.id ?? null)
    setShowCurrent(false)
  }
  const previewing = Boolean(pendingProposal && !showCurrent)

  const estimateAfter = (proposal: InvoiceProposal) => {
    if (!estimate) return null
    return buildInvoiceEstimates({ ...data, timeEntries: applyProposal(data.timeEntries, proposal) }).find((item) => item.id === estimate.id) ?? { ...estimate, lines: [], entryCount: 0, hours: 0, expenses: 0, subtotal: 0 }
  }
  const after = useMemo(() => (pendingProposal ? estimateAfter(pendingProposal) : null), [pendingProposal, data, estimate]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = previewing && after ? after : estimate
  const freshLines = useMemo(() => new Set(previewing && after && estimate ? after.lines.filter((line) => !estimate.lines.some((old) => old.id === line.id && old.amount === line.amount && old.description === line.description)).map((line) => line.id) : []), [previewing, after, estimate])

  // Each open proposal's effect on the current lines, worked out once per change to the data.
  const impacts = useMemo(() => new Map(messages.flatMap((message) => {
    if (!estimate || message.role !== "assistant" || !message.proposal || message.proposalState === "applied") return []
    const next = estimateAfter(message.proposal)
    return next ? [[message.proposal, { linesBefore: estimate.lines.length, linesAfter: next.lines.length, totalBefore: formatCurrency(estimate.subtotal, estimate.currency), totalAfter: formatCurrency(next.subtotal, estimate.currency) }] as const] : []
  })), [messages, data, estimate]) // eslint-disable-line react-hooks/exhaustive-deps
  const impact = (proposal: InvoiceProposal): ProposalImpact | null => impacts.get(proposal) ?? null

  const entries = useMemo(() => (estimate ? chatEntries(estimate) : []), [estimate])
  const openers = useMemo(() => (estimate ? starters(estimate) : []), [estimate])

  if (!estimate || !shown) return null
  const setMessages = (update: (list: ChatMessage[]) => ChatMessage[]) => setThreads((all) => ({ ...all, [estimate.id]: update(all[estimate.id] ?? []) }))

  async function applyChange(messageId: string, proposal: InvoiceProposal) {
    try {
      const change = await edits.apply(proposal)
      setUndos((all) => ({ ...all, [messageId]: change }))
      return true
    } catch (error) {
      toast.error("Couldn't apply the change", { description: error instanceof Error ? error.message : undefined })
      return false
    }
  }

  async function undoChange(messageId: string) {
    const change = undos[messageId]
    if (!change) return
    try {
      await edits.undo(change)
      setUndos((all) => Object.fromEntries(Object.entries(all).filter(([id]) => id !== messageId)))
      setMessages((list) => list.map((message) => (message.id === messageId && message.role === "assistant" ? { ...message, proposalState: "undone" } : message)))
    } catch (error) {
      toast.error("Couldn't undo the change", { description: error instanceof Error ? error.message : undefined })
    }
  }

  async function deleteLine(line: EstimateLine, entry?: TimeEntry) {
    const ids = entry ? [entry.id] : line.entries.map((item) => item.id)
    const label = line.expenseId ? "Expense deleted" : ids.length === 1 ? "Entry deleted" : `${ids.length} entries deleted`
    try {
      const change = await edits.apply({ ...emptyProposal(), delete: ids }, line.expenseId ? [line.expenseId] : [])
      setLastDelete({ label, change })
    } catch (error) {
      toast.error("Couldn't delete", { description: error instanceof Error ? error.message : undefined })
    }
  }

  function close() {
    setLastDelete(null)
    onClose()
  }

  async function undoDelete() {
    if (!lastDelete) return
    setLastDelete(null)
    try {
      await edits.undo(lastDelete.change)
    } catch (error) {
      toast.error("Couldn't undo the delete", { description: error instanceof Error ? error.message : undefined })
    }
  }

  const pendingTitle = pendingProposal?.title
  const indent = shown.lines.some((line) => line.entries.length > 1)
  const removedCount = pendingProposal ? pendingProposal.delete.length : 0

  return (
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) close() }}>
      <DialogContent data-testid="hypothetical-invoice" tabIndex={-1} onOpenAutoFocus={(event) => { event.preventDefault(); (event.currentTarget as HTMLElement).focus() }} className="flex h-[min(46rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl max-md:h-dvh max-md:max-h-dvh max-md:max-w-full max-md:rounded-none max-md:ring-0">
        <DialogHeader className="shrink-0 gap-0.5 border-b px-4 py-3 pr-12 text-left">
          <DialogTitle className="truncate">{estimate.clientName}</DialogTitle>
          <DialogDescription>Preview in {estimate.currency}. Nothing has been created or sent.</DialogDescription>
        </DialogHeader>
        <div role="tablist" aria-label="View" className="flex shrink-0 gap-1 border-b px-2 md:hidden">
          {(["lines", "chat"] as const).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={cn("-mb-px h-11 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset", tab === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}>
              {value === "lines" ? `Lines ${shown.lines.length}` : "Ask AI"}{value === "chat" && pending && <span aria-label="A change is waiting" className="ml-1.5 inline-block size-1.5 rounded-full bg-primary align-middle" />}
            </button>
          ))}
          {tab === "chat" && messages.length > 0 && <Button type="button" variant="ghost" size="icon-sm" className="ml-auto self-center" aria-label="New chat" title="New chat" disabled={messages.some((message) => message.role === "assistant" && !message.endedAt)} onClick={() => setMessages(() => [])}><SquarePen /></Button>}
        </div>
        <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_24rem]">
          <section aria-label="Invoice lines" className={cn("flex min-h-0 flex-col", tab !== "lines" && "max-md:hidden")}>
            {pendingProposal && (
              <div role="status" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-primary/[0.07] px-4 py-2 text-[13px]">
                <span className="min-w-0 flex-1"><span className="font-medium">{showCurrent ? "Showing the current lines" : `Previewing: ${pendingTitle}`}</span>{!showCurrent && removedCount > 0 && <span className="text-destructive"> · deletes {plural(removedCount, "entry")}</span>}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowCurrent(!showCurrent)}>{showCurrent ? "Show change" : "Show current"}</Button>
                <Button type="button" variant="outline" size="sm" className="md:hidden" onClick={() => setTab("chat")}>Back to chat</Button>
              </div>
            )}
            {lastDelete && !previewing && (
              <div role="status" className="flex shrink-0 items-center gap-3 border-b bg-muted/60 px-4 py-1.5 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{lastDelete.label}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => void undoDelete()}>Undo</Button>
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => setLastDelete(null)}><X /></Button>
              </div>
            )}
            <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {shown.lines.map((line) => <LineRow key={line.id} line={line} currency={estimate.currency} fresh={freshLines.has(line.id)} indent={indent} editable={!previewing} onDelete={deleteLine} />)}
              {shown.lines.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing left to bill.</li>}
            </ul>
            <div className="shrink-0 border-t px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground tabular-nums">{plural(shown.lines.length, "line")} · {hoursLabel(shown.hours)}h</span>
                <span className="text-sm font-medium">Total before tax</span>
                <span data-testid="estimate-total" className="text-lg font-semibold tabular-nums">{formatCurrency(shown.subtotal, estimate.currency)}</span>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>Done</Button>
                {onCreateInvoice && <Button type="button" disabled={Boolean(pendingProposal)} title={pendingProposal ? "Apply or discard the change first" : undefined} onClick={() => onCreateInvoice(estimate)}>Create invoice</Button>}
              </div>
            </div>
          </section>
          <InvoiceChat
            className={cn("md:border-l", tab !== "chat" && "max-md:hidden")}
            clientName={estimate.clientName}
            currency={estimate.currency}
            entries={entries}
            messages={messages}
            onMessages={setMessages}
            starters={openers}
            impact={impact}
            onApply={applyChange}
            onUndo={(id) => void undoChange(id)}
            onReview={() => { setShowCurrent(false); setTab("lines") }}
            undoable={(id) => id in undos}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
