"use client"

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import { format } from "date-fns"
import { ArrowLeft, ChevronDown, LoaderCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
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
    return <Image src="/t3-code-logo.svg" alt="T3 Code" width={32} height={32} className={`shrink-0 rounded-md shadow-sm ${className}`} />
  }
  if (source === "Claude" || agent === "Claude" || agent === "Fable") {
    return <span className={`grid shrink-0 place-items-center rounded-md bg-[#f0eee6] shadow-sm ${className}`} aria-label="Claude logo"><Image src="/claude-logo.svg" alt="" width={32} height={32} className="size-[72%]" /></span>
  }
  return <span className={`grid shrink-0 place-items-center rounded-md bg-emerald-600 text-white shadow-sm ${className}`} aria-label="ChatGPT logo"><svg viewBox="0 0 24 24" className="size-[76%]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M11.217 19.384A3.501 3.501 0 0 0 18 18.167V13l-6-3.35" /><path d="M5.214 15.014A3.501 3.501 0 0 0 9.66 20.28L14 17.746V10.8" /><path d="M6 7.63c-1.391-.236-2.787.395-3.534 1.689a3.474 3.474 0 0 0 1.271 4.745L8 16.578l6-3.348" /><path d="M12.783 4.616A3.501 3.501 0 0 0 6 5.833V10.9l6 3.45" /><path d="M18.786 8.986A3.501 3.501 0 0 0 14.34 3.72L10 6.254V13.2" /><path d="M18 16.302c1.391.236 2.787-.395 3.534-1.689a3.474 3.474 0 0 0-1.271-4.745l-4.308-2.514L10 10.774" /></svg></span>
}

function ChatBillFactor({ factor, onChange }: { factor: number; onChange: (factor: number) => void }) {
  const [custom, setCustom] = useState("")
  const isPreset = BILL_FACTOR_PRESETS.some((option) => Math.abs(option.value - factor) < 0.0001)
  return <div className="flex flex-wrap items-center gap-1 text-xs" data-testid="chat-bill-factor">
    <span className="mr-1 text-muted-foreground">Bill</span>
    {BILL_FACTOR_PRESETS.map((option) => <Button key={option.label} type="button" size="xs" variant={Math.abs(option.value - factor) < 0.0001 ? "default" : "outline"} className="h-6 rounded-md px-2" aria-pressed={Math.abs(option.value - factor) < 0.0001} onClick={() => onChange(option.value)}>{option.label}</Button>)}
    <form className="flex items-center gap-1" onSubmit={(event) => { event.preventDefault(); const percent = Number(custom); if (custom.trim() === "" || !Number.isFinite(percent) || percent < 0 || percent > 100) { toast.error("Enter a percentage from 0 to 100"); return } onChange(percent / 100); setCustom("") }}>
      <Input type="number" min={0} max={100} step="any" inputMode="decimal" aria-label="Custom billing percentage" placeholder={isPreset ? "%" : `${Math.round(factor * 1000) / 10}`} value={custom} onChange={(event) => setCustom(event.target.value)} className={`h-6 w-14 rounded-md px-1.5 text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${isPreset ? "" : "border-primary"}`} />
      <span className="text-muted-foreground">%</span>
    </form>
  </div>
}

/** The chat's active spans drawn across the entry, so overlap and gaps are visible at a glance. */
function SpanStrip({ spans, start, end }: { spans: { start: number; end: number }[]; start: number; end: number }) {
  const length = end - start
  if (!Number.isFinite(length) || length <= 0) return null
  return <div className="relative mt-2 h-1.5 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
    {spans.map((span) => <span key={span.start} className="absolute inset-y-0 rounded-sm bg-primary/70" style={{ left: `${((span.start - start) / length) * 100}%`, width: `${Math.max(0.75, ((span.end - span.start) / length) * 100)}%` }} />)}
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
    parts.push(text.slice(index, found), <mark key={found} className="rounded-sm bg-yellow-300/70 text-foreground">{text.slice(found, found + needle.length)}</mark>)
    index = found + needle.length
  }
  parts.push(text.slice(index))
  return parts
}

function MessageRow({ message, placement, agent, withDate, needle }: { message: TranscriptMessage; placement: MessagePlacement; agent: string; withDate: boolean; needle: string }) {
  const [expanded, setExpanded] = useState(false)
  const long = message.text.length > COLLAPSED_MESSAGE_CHARS && !needle
  const text = long && !expanded ? `${message.text.slice(0, COLLAPSED_MESSAGE_CHARS).trimEnd()}…` : message.text
  const outside = placement === "before" || placement === "after"
  return <article className={`grid min-w-0 grid-cols-1 gap-1 border-l-2 py-2.5 pl-3 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-3 ${message.role === "user" ? "border-primary" : "border-border"} ${outside ? "opacity-55" : ""}`} data-placement={placement}>
    <div className="flex flex-wrap items-baseline gap-x-2 text-xs sm:block">
      <p className={`font-medium ${message.role === "user" ? "text-foreground" : "text-muted-foreground"}`}>{message.role === "user" ? "Prompt" : agent}</p>
      <p className="font-mono text-[0.7rem] text-muted-foreground">{message.at ? clock(message.at, withDate) : "No time"}</p>
      {outside && <p className="text-[0.7rem] text-muted-foreground">{placement === "before" ? "Before entry" : "After entry"}</p>}
    </div>
    <div className="min-w-0">
      <p className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${message.role === "user" ? "font-medium" : ""}`}>{highlight(text, needle)}</p>
      {long && <button type="button" className="mt-1 cursor-pointer rounded-md text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : `Show full message (${message.text.length.toLocaleString()} characters)`}</button>}
    </div>
  </article>
}

function Boundary({ label }: { label: string }) {
  return <div className="flex items-center gap-2 py-1.5 text-[0.7rem] font-medium uppercase tracking-wide text-primary" role="separator"><span className="h-px flex-1 bg-primary/40" />{label}<span className="h-px flex-1 bg-primary/40" /></div>
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
    try {
      const next = await fetchPage(transcript.nextOffset)
      setState((current) => current?.key === key && current.transcript ? { key, transcript: { ...next, messages: [...current.transcript.messages, ...next.messages] } } : current)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load more messages")
      setState((current) => current ? { ...current, loadingMore: false } : current)
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

  return <section className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="agent-chat-panel" aria-label="Chat transcript">
    <header className="shrink-0 border-b px-4 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <Button type="button" variant="ghost" size="icon-xs" className="mt-0.5 sm:hidden" aria-label="Back to chats" onClick={onBack}><ArrowLeft className="size-4" /></Button>
        <SourceLogo source={source.source} agent={source.agent} className="size-7" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug break-words">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{source.machineLabel || machineName(source)} · {sourceDescription(source)}{source.model ? ` · ${source.model}` : ""}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div><dt className="text-muted-foreground">Tracked in entry</dt><dd className="font-mono">{formatDuration(source.durationSeconds)}</dd></div>
        <div><dt className="text-muted-foreground">Active spans</dt><dd>{source.spans.length}</dd></div>
        <div><dt className="text-muted-foreground">Messages in entry</dt><dd>{loading ? "…" : timed ? `${insideCount} of ${total}` : "No timestamps"}</dd></div>
        <div><dt className="text-muted-foreground">Billed share</dt><dd>{factor === 1 ? "100%" : formatBillFactor(factor)}</dd></div>
      </dl>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer rounded-md text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">Activity spans</summary>
        <ul className="mt-1.5 grid gap-0.5 font-mono">
          {source.spans.map((span) => <li key={span.start}>{clock(span.start, multiDay)} – {clock(span.end, multiDay)} <span className="text-muted-foreground">({formatDuration(Math.floor((span.end - span.start) / 1000))})</span></li>)}
        </ul>
      </details>
      {onSetFactor && <div className="mt-2.5"><ChatBillFactor factor={factor} onChange={onSetFactor} /></div>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5" role="group" aria-label="Messages to show">
          <Button type="button" size="xs" variant={effectiveScope === "entry" ? "secondary" : "ghost"} className="h-6 rounded-md px-2" aria-pressed={effectiveScope === "entry"} disabled={!timed} onClick={() => setScope("entry")}>This entry</Button>
          <Button type="button" size="xs" variant={effectiveScope === "all" ? "secondary" : "ghost"} className="h-6 rounded-md px-2" aria-pressed={effectiveScope === "all"} onClick={() => setScope("all")}>Whole chat</Button>
        </div>
        <Input className="h-7 min-w-0 flex-1 rounded-md text-xs" aria-label="Find in chat" placeholder="Find in chat…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
    </header>
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2" data-testid="agent-chat-messages">
      {loading && <div className="grid gap-3 py-2"><Skeleton className="h-10 w-2/3 rounded-md" /><Skeleton className="h-16 w-full rounded-md" /><Skeleton className="h-8 w-1/2 rounded-md" /></div>}
      {!loading && state?.error && <p className="py-6 text-center text-sm text-muted-foreground">{state.error}</p>}
      {!loading && transcript && messages.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">This chat has no messages yet.</p>}
      {!loading && transcript && messages.length > 0 && visible.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{needle ? "No messages match this search." : "No loaded messages fall inside this entry. Show the whole chat to see its context."}</p>}
      {visible.map(({ index: messageIndex, message, placement }, index) => {
        const previous = visible[index - 1]?.placement
        return <Fragment key={messageIndex}>
          {effectiveScope === "all" && timed && placement === "inside" && previous !== "inside" && <Boundary label={`Entry starts ${clock(entryStart, multiDay)}`} />}
          {effectiveScope === "all" && timed && placement === "after" && previous !== "after" && Number.isFinite(entryEnd) && <Boundary label={`Entry ends ${clock(entryEnd, multiDay)}`} />}
          <MessageRow message={message} placement={placement} agent={source.agent || "Agent"} withDate={multiDay} needle={needle} />
        </Fragment>
      })}
      {state?.loadingMore && <p className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Reading messages… {messages.length} / {total}</p>}
      {!state?.loadingMore && transcript?.nextOffset != null && <Button className="my-3 w-full" variant="outline" onClick={() => void loadMore()}>Load more messages ({messages.length} / {total})</Button>}
    </div>
  </section>
}

export function EntryChats({ description, sources, start, end, labels, inferred = false, chatFactors, onSetChatFactor }: { description: string; sources: AgentTimeSourceInterval[]; start: number; end: number; labels: Record<string, string>; inferred?: boolean; chatFactors?: Record<string, number>; onSetChatFactor?: (chat: ConversationSource, factor: number) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<"list" | "chat">("list")
  const conversations = useMemo(() => open ? groupConversationSources(sources, start, end).map((source) => ({ ...source, machineLabel: machineName(source, labels) })) : [], [open, sources, start, end, labels])
  const needle = query.trim().toLowerCase()
  const filtered = conversations.filter((source) => `${source.conversationTitle} ${source.conversationSummary || ""} ${source.machineLabel} ${source.source} ${source.model}`.toLowerCase().includes(needle))
  const pages = Math.max(1, Math.ceil(filtered.length / CHAT_PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  const selected = conversations.find((source) => conversationKey(source) === selectedKey) ?? conversations[0] ?? null
  const totalSeconds = conversations.reduce((total, source) => total + source.durationSeconds, 0)
  const factorOf = (source: ConversationSource) => normalizeBillFactor(chatFactors?.[conversationKey(source)] ?? 1)
  const range = Number.isFinite(end) ? `${format(start, "MMM d, HH:mm:ss")} – ${format(end, new Date(start).toDateString() === new Date(end).toDateString() ? "HH:mm:ss" : "MMM d, HH:mm:ss")}` : `${format(start, "MMM d, HH:mm:ss")} – now`

  return <>
    <button type="button" className="flex w-full min-w-0 cursor-pointer items-start gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring" data-testid="entry-chat-menu" aria-label={`Chats for ${description || "Untitled"}`} onClick={() => { setOpen(true); setQuery(""); setPage(0); setSelectedKey(null); setMobileView("list") }}>
      <span className="min-w-0 flex-1 break-words">{description || "Untitled"}</span><ChevronDown className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[min(90dvh,56rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-0 overflow-hidden rounded-md p-0 sm:w-[calc(100vw-4rem)] sm:max-w-6xl" data-testid="entry-chats-dropdown">
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 text-left">
          <DialogTitle className="break-words text-base">{description || "Untitled"}</DialogTitle>
          <DialogDescription className="text-xs">
            <span className="font-mono">{range}</span> · {conversations.length} {conversations.length === 1 ? "chat" : "chats"} · {formatDuration(totalSeconds)} of chat activity
            {inferred && <span className="block">Matched from available activity logs. Older entries did not save chat references.</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <aside className={`${mobileView === "list" ? "flex" : "hidden"} min-h-0 w-full flex-col border-r sm:flex sm:w-80 sm:shrink-0`} aria-label="Chats in this entry">
            <div className="shrink-0 border-b p-3">
              <Input className="h-8 rounded-md" aria-label="Search entry chats" placeholder="Search chats, machines, models…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {filtered.slice(currentPage * CHAT_PAGE_SIZE, currentPage * CHAT_PAGE_SIZE + CHAT_PAGE_SIZE).map((source) => {
                const active = selected && conversationKey(selected) === conversationKey(source)
                const factor = factorOf(source)
                return <button key={conversationKey(source)} type="button" aria-current={active ? "true" : undefined} className={`flex w-full min-w-0 cursor-pointer items-start gap-2.5 rounded-md p-2.5 text-left focus-visible:outline-2 focus-visible:outline-ring ${active ? "bg-muted" : "hover:bg-muted/60"}`} onClick={() => { setSelectedKey(conversationKey(source)); setMobileView("chat") }}>
                  <SourceLogo source={source.agent} agent={source.agent} className="mt-0.5 size-5" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm font-medium">{source.conversationTitle || source.conversationSummary || "Untitled chat"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="rounded-md bg-background px-1.5 text-foreground">{source.machineLabel}</span>
                      <span className="truncate">{source.model || source.agent || source.source}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-muted-foreground">{format(source.spans[0].start, "HH:mm")}–{format(source.spans.at(-1)!.end, "HH:mm")}</span>
                      <span className="font-mono">{formatDuration(source.durationSeconds)}{factor !== 1 && <span className="ml-1.5 rounded-md border px-1 text-[0.65rem] text-muted-foreground">bill {formatBillFactor(factor)}</span>}</span>
                    </div>
                    <SpanStrip spans={source.spans} start={start} end={Number.isFinite(end) ? end : Math.max(...source.spans.map((span) => span.end))} />
                  </div>
                </button>
              })}
              {filtered.length === 0 && <p className="p-4 text-sm text-muted-foreground">{query ? "No chats match this search." : "No chat references are available for this entry. Check that its source machine is connected."}</p>}
            </div>
            {pages > 1 && <div className="flex shrink-0 items-center justify-between border-t px-3 py-2 text-xs"><Button size="sm" variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>{currentPage + 1} / {pages}</span><Button size="sm" variant="ghost" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Next</Button></div>}
          </aside>
          <div className={`${mobileView === "chat" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 sm:flex`}>
            {selected
              ? <ChatTranscript source={selected} entryStart={start} entryEnd={end} factor={factorOf(selected)} onSetFactor={onSetChatFactor ? (factor) => onSetChatFactor(selected, factor) : undefined} onBack={() => setMobileView("list")} />
              : <p className="m-auto p-6 text-sm text-muted-foreground">Select a chat to read it.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
