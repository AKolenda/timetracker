"use client"

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import { format } from "date-fns"
import { ArrowLeft, ChevronDown, LoaderCircle, Search } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { machineName } from "@/lib/agent-time-hosts"
import { conversationKey, groupConversationSources, messagePlacement, type MessagePlacement } from "@/lib/agent-time-chats"
import { BILL_FACTOR_PRESETS, formatBillFactor, normalizeBillFactor } from "@/lib/billing"
import { formatDuration } from "@/lib/format"
import type { AgentTimeSourceInterval } from "@/lib/agent-time"

export type ConversationSource = ReturnType<typeof groupConversationSources>[number]
type TranscriptMessage = { role: "user" | "assistant"; text: string; at: string | null }
type Transcript = { source: string; conversationId: string; title: string; messages: TranscriptMessage[]; nextOffset?: number | null; totalMessages?: number }

const CHAT_PAGE_SIZE = 8
/** Pages of 100 messages fetched up front so the entry's window is usually loaded without clicking. */
const AUTO_LOAD_PAGES = 20
const COLLAPSED_MESSAGE_CHARS = 1200

function sourceDescription(interval: AgentTimeSourceInterval) {
  if (interval.source === "T3 Code") return `T3 Code using ${interval.agent}`
  return `${interval.source || interval.agent} directly`
}

function SourceLogo({ source, agent, className = "size-6" }: { source: string; agent: string; className?: string }) {
  if (source === "T3 Code") {
    return <Image src="/t3-code-logo.svg" alt="T3 Code" width={32} height={32} className={`shrink-0 rounded-[5px] ${className}`} />
  }
  if (source === "Claude" || agent === "Claude" || agent === "Fable") {
    return <span className={`grid shrink-0 place-items-center rounded-[5px] bg-[#f0eee6] ${className}`} aria-label="Claude logo"><Image src="/claude-logo.svg" alt="" width={32} height={32} className="size-[72%]" /></span>
  }
  return <span className={`grid shrink-0 place-items-center rounded-[5px] bg-emerald-600 text-white ${className}`} aria-label="ChatGPT logo"><svg viewBox="0 0 24 24" className="size-[76%]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M11.217 19.384A3.501 3.501 0 0 0 18 18.167V13l-6-3.35" /><path d="M5.214 15.014A3.501 3.501 0 0 0 9.66 20.28L14 17.746V10.8" /><path d="M6 7.63c-1.391-.236-2.787.395-3.534 1.689a3.474 3.474 0 0 0 1.271 4.745L8 16.578l6-3.348" /><path d="M12.783 4.616A3.501 3.501 0 0 0 6 5.833V10.9l6 3.45" /><path d="M18.786 8.986A3.501 3.501 0 0 0 14.34 3.72L10 6.254V13.2" /><path d="M18 16.302c1.391.236 2.787-.395 3.534-1.689a3.474 3.474 0 0 0-1.271-4.745l-4.308-2.514L10 10.774" /></svg></span>
}

function ChatBillFactor({ factor, onChange }: { factor: number; onChange: (factor: number) => void }) {
  const [custom, setCustom] = useState("")
  const isPreset = BILL_FACTOR_PRESETS.some((option) => Math.abs(option.value - factor) < 0.0001)
  return <div className="flex items-center gap-1.5 text-xs" data-testid="chat-bill-factor">
    <span className="text-muted-foreground">Bill</span>
    <div className="flex items-center rounded-md border p-0.5">
      {BILL_FACTOR_PRESETS.map((option) => { const active = Math.abs(option.value - factor) < 0.0001; return <button key={option.label} type="button" className={`h-5 cursor-pointer rounded-[4px] px-1.5 font-medium focus-visible:outline-2 focus-visible:outline-ring ${active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`} aria-pressed={active} onClick={() => onChange(option.value)}>{option.label}</button> })}
      <form className="flex items-center" onSubmit={(event) => { event.preventDefault(); const percent = Number(custom); if (custom.trim() === "" || !Number.isFinite(percent) || percent < 0 || percent > 100) { toast.error("Enter a percentage from 0 to 100"); return } onChange(percent / 100); setCustom("") }}>
        <input type="number" min={0} max={100} step="any" inputMode="decimal" aria-label="Custom billing percentage" placeholder={isPreset ? "%" : `${Math.round(factor * 1000) / 10}%`} value={custom} onChange={(event) => setCustom(event.target.value)} className={`h-5 w-11 rounded-[4px] bg-transparent px-1.5 text-center font-medium outline-none [appearance:textfield] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${isPreset ? "" : "bg-accent placeholder:text-foreground"}`} />
      </form>
    </div>
  </div>
}

function clock(time: number | string, withDate: boolean) {
  return format(new Date(time), withDate ? "MMM d, HH:mm:ss" : "HH:mm:ss")
}

function highlight(text: string, needle: string): ReactNode {
  if (!needle) return text
  const lower = text.toLowerCase()
  const parts: ReactNode[] = []
  let index = 0
  for (let found = lower.indexOf(needle); found !== -1; found = lower.indexOf(needle, index)) {
    parts.push(text.slice(index, found), <mark key={found} className="rounded-[3px] bg-primary/25 text-foreground">{text.slice(found, found + needle.length)}</mark>)
    index = found + needle.length
  }
  parts.push(text.slice(index))
  return parts
}

function MessageRow({ message, placement, source, withDate, needle }: { message: TranscriptMessage; placement: MessagePlacement; source: ConversationSource; withDate: boolean; needle: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = message.text.length > COLLAPSED_MESSAGE_CHARS && !needle
  const text = long && !expanded ? `${message.text.slice(0, COLLAPSED_MESSAGE_CHARS).trimEnd()}…` : message.text
  const outside = placement === "before" || placement === "after"
  const user = message.role === "user"
  return <article className={`flex min-w-0 gap-3 py-3 ${outside ? "opacity-50" : ""}`} data-placement={placement}>
    {user
      ? <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground" aria-hidden="true">Y</span>
      : <SourceLogo source={source.source} agent={source.agent} className="mt-px size-5" />}
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium">{user ? "You" : source.agent || "Agent"}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{message.at ? clock(message.at, withDate) : "No time"}{outside && ` · ${placement === "before" ? "before entry" : "after entry"}`}</span>
      </p>
      <p className={`mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed ${user ? "text-foreground" : "text-foreground/85"}`}>{highlight(text, needle)}</p>
      {long && <button type="button" className="mt-1 cursor-pointer rounded-md text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : `Show full message · ${message.text.length.toLocaleString()} characters`}</button>}
    </div>
  </article>
}

function Boundary({ label }: { label: string }) {
  return <div className="flex items-center gap-3 py-2 text-xs text-muted-foreground" role="separator"><span className="h-px flex-1 bg-border" />{label}<span className="h-px flex-1 bg-border" /></div>
}

function ChatTranscript({ source, entryStart, entryEnd, factor, onSetFactor, onBack }: { source: ConversationSource; entryStart: number; entryEnd: number; factor: number; onSetFactor?: (factor: number) => void; onBack: () => void }) {
  const key = `${source.hostUrl || ""}:${source.source}:${source.conversationId}`
  const [state, setState] = useState<{ key: string; transcript?: Transcript; error?: string; loadingMore?: boolean } | null>(null)
  const [scope, setScope] = useState<"entry" | "all">("entry")
  const [query, setQuery] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  async function fetchPage(offset: number) {
    const query = new URLSearchParams({ source: source.source, id: source.conversationId, host: source.hostUrl || "", offset: String(offset) })
    const response = await fetch(`/api/agent-time/transcript?${query}`)
    const body = await response.json().catch(() => ({})) as { transcript?: Transcript; error?: string }
    if (!response.ok || !body.transcript) throw new Error(body.error || "Unable to read the chat.")
    return body.transcript
  }

  useEffect(() => {
    let cancelled = false
    setScope("entry")
    setQuery("")
    scrollRef.current?.scrollTo({ top: 0 })
    void (async () => {
      try {
        let transcript = await fetchPage(0)
        if (cancelled) return
        setState({ key, transcript, loadingMore: transcript.nextOffset != null })
        // Keep reading until the chat passes the entry's end, so the audited window is complete.
        for (let page = 1; page < AUTO_LOAD_PAGES && transcript.nextOffset != null; page++) {
          const last = transcript.messages.at(-1)
          if (last && messagePlacement(last.at, entryStart, entryEnd) === "after") break
          const next = await fetchPage(transcript.nextOffset)
          if (cancelled) return
          transcript = { ...next, messages: [...transcript.messages, ...next.messages] }
          setState({ key, transcript, loadingMore: true })
        }
        if (!cancelled) setState({ key, transcript })
      } catch (error) {
        if (!cancelled) setState((current) => current?.key === key && current.transcript ? { ...current, loadingMore: false } : { key, error: error instanceof Error ? error.message : "Unable to read the chat." })
      }
    })()
    return () => { cancelled = true }
    // fetchPage only reads source, which key identifies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, entryStart, entryEnd])

  async function loadMore() {
    const transcript = state?.transcript
    if (transcript?.nextOffset == null || state?.loadingMore) return
    setState({ ...state!, loadingMore: true })
    // Only apply the result to the transcript this request extended.
    try {
      const next = await fetchPage(transcript.nextOffset)
      setState((current) => current?.transcript === transcript ? { key, transcript: { ...next, messages: [...transcript.messages, ...next.messages] } } : current)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load more messages")
      setState((current) => current?.transcript === transcript ? { ...current, loadingMore: false } : current)
    }
  }

  const transcript = state?.key === key ? state.transcript : undefined
  const messages = useMemo(() => (transcript?.messages ?? []).map((message, index) => ({ index, message, placement: messagePlacement(message.at, entryStart, entryEnd) })), [transcript, entryStart, entryEnd])
  const timed = messages.some((item) => item.placement !== "unknown")
  const insideCount = messages.filter((item) => item.placement === "inside").length
  const effectiveScope = timed ? scope : "all"
  const needle = query.trim().toLowerCase()
  const visible = messages.filter((item) => (effectiveScope === "all" || item.placement === "inside") && (!needle || item.message.text.toLowerCase().includes(needle)))
  const multiDay = messages.some((item) => item.message.at && new Date(item.message.at).toDateString() !== new Date(entryStart).toDateString())
  const title = transcript?.title || source.conversationTitle || `${source.agent} conversation`
  const loading = !state || state.key !== key
  const total = transcript?.totalMessages ?? messages.length
  // Boundaries mark where the entry starts and ends among the visible messages, even when no message falls on one side.
  const complete = transcript?.nextOffset == null && !state?.loadingMore
  const hasEnd = Number.isFinite(entryEnd)
  const startLabel = `Entry started ${clock(entryStart, multiDay)}`
  const endLabel = hasEnd ? `Entry ended ${clock(entryEnd, multiDay)}` : ""
  const firstFrom = (placements: MessagePlacement[]) => { const found = visible.findIndex((item) => placements.includes(item.placement)); return found === -1 ? (complete ? visible.length : -1) : found }
  const startAt = !timed || loading ? -1 : effectiveScope === "entry" ? 0 : firstFrom(["inside", "after"])
  const endAt = !timed || loading || !hasEnd ? -1 : effectiveScope === "entry" ? (complete ? visible.length : -1) : firstFrom(["after"])

  return <section className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="agent-chat-panel" aria-label="Chat transcript">
    <header className="shrink-0 border-b px-5 pt-4 pb-3">
      <div className="flex min-w-0 items-start gap-2">
        <Button type="button" variant="ghost" size="icon-xs" className="-ml-1.5 mt-px text-muted-foreground sm:hidden" aria-label="Back to chats" onClick={onBack}><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-medium leading-snug break-words">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {source.machineLabel || machineName(source)} · {sourceDescription(source)}{source.model ? ` · ${source.model}` : ""}
            <span className="block sm:inline"><span className="hidden sm:inline"> · </span><span className="tabular-nums">{formatDuration(source.durationSeconds)}</span> in entry · {loading ? "reading…" : timed ? `${insideCount} of ${total} messages in entry` : "no message times"}</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border p-0.5 text-xs" role="group" aria-label="Messages to show">
          {(["entry", "all"] as const).map((value) => <button key={value} type="button" className={`h-5 cursor-pointer rounded-[4px] px-2 font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ring ${effectiveScope === value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`} aria-pressed={effectiveScope === value} disabled={value === "entry" && !timed} onClick={() => setScope(value)}>{value === "entry" ? "This entry" : "Whole chat"}</button>)}
        </div>
        {onSetFactor && <ChatBillFactor factor={factor} onChange={onSetFactor} />}
        <label className="flex h-7 min-w-36 flex-1 items-center gap-1.5 rounded-md px-2 text-muted-foreground focus-within:bg-accent/60 hover:bg-accent/60 sm:ml-auto sm:max-w-56">
          <Search className="size-3.5 shrink-0" />
          <input className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground sm:text-xs" aria-label="Find in chat" placeholder="Find in chat" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
    </header>
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2" data-testid="agent-chat-messages">
      {loading && <div className="grid gap-3 py-2"><Skeleton className="h-10 w-2/3 rounded-md" /><Skeleton className="h-16 w-full rounded-md" /><Skeleton className="h-8 w-1/2 rounded-md" /></div>}
      {!loading && state?.error && <p className="py-6 text-center text-sm text-muted-foreground">{state.error}</p>}
      {!loading && transcript && messages.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">This chat has no messages yet.</p>}
      {!loading && transcript && messages.length > 0 && visible.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{needle ? "No messages match this search." : "No loaded messages fall inside this entry. Show the whole chat to see its context."}</p>}
      {startAt === 0 && <Boundary label={startLabel} />}
      {visible.map(({ index: messageIndex, message, placement }, index) => <Fragment key={messageIndex}>
        {index > 0 && index === startAt && <Boundary label={startLabel} />}
        {index === endAt && <Boundary label={endLabel} />}
        <MessageRow message={message} placement={placement} source={source} withDate={multiDay} needle={needle} />
      </Fragment>)}
      {startAt === visible.length && visible.length > 0 && <Boundary label={startLabel} />}
      {endAt === visible.length && visible.length > 0 && <Boundary label={endLabel} />}
      {state?.loadingMore && <p className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Reading messages… {messages.length} / {total}</p>}
      {!state?.loadingMore && transcript?.nextOffset != null && <Button className="my-3 w-full" variant="ghost" size="sm" onClick={() => void loadMore()}>Load more messages ({messages.length} / {total})</Button>}
    </div>
  </section>
}

export function EntryChats({ description, sources, start, end, labels, inferred = false, chatFactors, onSetChatFactor }: { description: string; sources: AgentTimeSourceInterval[]; start: number; end: number; labels: Record<string, string>; inferred?: boolean; chatFactors?: Record<string, number>; onSetChatFactor?: (chat: ConversationSource, factor: number) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<"list" | "chat">("list")
  const openerRef = useRef<HTMLButtonElement>(null)
  const conversations = useMemo(() => open ? groupConversationSources(sources, start, end).map((source) => ({ ...source, machineLabel: machineName(source, labels) })) : [], [open, sources, start, end, labels])
  const needle = query.trim().toLowerCase()
  const filtered = conversations.filter((source) => `${source.conversationTitle} ${source.conversationSummary || ""} ${source.machineLabel} ${source.source} ${source.model}`.toLowerCase().includes(needle))
  const pages = Math.max(1, Math.ceil(filtered.length / CHAT_PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  const selected = conversations.find((source) => conversationKey(source) === selectedKey) ?? conversations[0] ?? null
  const totalSeconds = conversations.reduce((total, source) => total + source.durationSeconds, 0)
  const factorOf = (source: ConversationSource) => normalizeBillFactor(chatFactors?.[conversationKey(source)] ?? 1)
  const range = Number.isFinite(end) ? `${format(start, "MMM d, HH:mm")}–${format(end, new Date(start).toDateString() === new Date(end).toDateString() ? "HH:mm" : "MMM d, HH:mm")}` : `${format(start, "MMM d, HH:mm")}–now`

  return <>
    <button ref={openerRef} type="button" className="flex w-full min-w-0 cursor-pointer items-start gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring" data-testid="entry-chat-menu" aria-label={`Chats for ${description || "Untitled"}`} onClick={() => { setOpen(true); setQuery(""); setPage(0); setSelectedKey(null); setMobileView("list") }}>
      <span className="min-w-0 flex-1 break-words">{description || "Untitled"}</span><ChevronDown className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[min(90dvh,56rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-md p-0 sm:w-[calc(100vw-4rem)] sm:max-w-6xl" data-testid="entry-chats-dropdown" onCloseAutoFocus={(event) => { event.preventDefault(); openerRef.current?.focus() }}>
        <DialogHeader className="shrink-0 border-b px-5 py-3 pr-12 text-left">
          <DialogTitle className="truncate text-sm font-medium">{description || "Untitled"}</DialogTitle>
          <DialogDescription className="text-xs tabular-nums">
            {range} · {conversations.length} {conversations.length === 1 ? "chat" : "chats"} · {formatDuration(totalSeconds)} active
            {inferred && <span className="block">Matched from activity logs; older entries did not save chat references.</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <aside className={`${mobileView === "list" ? "flex" : "hidden"} min-h-0 w-full flex-col bg-muted/40 sm:flex sm:w-72 sm:shrink-0 sm:border-r`} aria-label="Chats in this entry">
            <label className="mx-2 mt-2 flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-muted-foreground focus-within:bg-accent hover:bg-accent/60">
              <Search className="size-3.5 shrink-0" />
              <input className="min-w-0 flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground sm:text-sm" aria-label="Search entry chats" placeholder="Search chats" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} />
            </label>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filtered.slice(currentPage * CHAT_PAGE_SIZE, currentPage * CHAT_PAGE_SIZE + CHAT_PAGE_SIZE).map((source) => {
                const active = selected && conversationKey(selected) === conversationKey(source)
                const factor = factorOf(source)
                return <button key={conversationKey(source)} type="button" aria-current={active ? "true" : undefined} className={`flex w-full min-w-0 cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-ring ${active ? "bg-accent" : "hover:bg-accent/60"}`} onClick={() => { setSelectedKey(conversationKey(source)); setMobileView("chat") }}>
                  <SourceLogo source={source.agent} agent={source.agent} className="mt-0.5 size-4" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{source.conversationTitle || source.conversationSummary || "Untitled chat"}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDuration(source.durationSeconds)}</span>
                    </span>
                    <span className="mt-0.5 flex items-baseline gap-2 text-xs text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">{source.machineLabel} · {source.model || source.agent || source.source}</span>
                      <span className="shrink-0 tabular-nums">{format(source.spans[0].start, "HH:mm")}–{format(source.spans.at(-1)!.end, "HH:mm")}{factor !== 1 && ` · ${formatBillFactor(factor)}`}</span>
                    </span>
                  </span>
                </button>
              })}
              {filtered.length === 0 && <p className="p-3 text-sm text-muted-foreground">{query ? "No chats match this search." : "No chat references are available for this entry. Check that its source machine is connected."}</p>}
            </div>
            {pages > 1 && <div className="flex shrink-0 items-center justify-between border-t px-2 py-1.5 text-xs text-muted-foreground"><Button size="xs" variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="tabular-nums">{currentPage + 1} / {pages}</span><Button size="xs" variant="ghost" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Next</Button></div>}
          </aside>
          <div className={`${mobileView === "chat" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 sm:flex`}>
            {selected
              ? <ChatTranscript key={conversationKey(selected)} source={selected} entryStart={start} entryEnd={end} factor={factorOf(selected)} onSetFactor={onSetChatFactor ? (factor) => onSetChatFactor(selected, factor) : undefined} onBack={() => setMobileView("list")} />
              : <p className="m-auto p-6 text-sm text-muted-foreground">Select a chat to read it.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
