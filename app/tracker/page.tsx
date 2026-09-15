"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { machineName } from "@/lib/agent-time-hosts"
import { clipAgentSources } from "@/lib/agent-time-provenance"
import {
  ArrowUpRight,
  Play,
  Pause,
  Square,
  Trash2,
  Pencil,
  Clock,
  CalendarIcon,
  Plus,
  LoaderCircle,
  ChevronsUpDown,
  ChevronDown,
  Check,
  MessageSquareText,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { TrackerReviewDialog } from "@/components/tracker-review-dialog"
import { PageHeader } from "@/components/page-header"
import { useStore } from "@/lib/store"
import { formatCurrency, formatDuration, formatHours } from "@/lib/format"
import { localDateString, parseLocalDate } from "@/lib/datetime"
import { subtractRanges, occupiedProjectRanges, entryOverlapDetails, type TimeRange } from "@/lib/agent-time-overlap"
import { groupConversationSources } from "@/lib/agent-time-chats"
import { splitAgentRange } from "@/lib/agent-time-intervals"
import { PERSONAL_AGENT_PROJECT } from "@/lib/agent-import-projects"
import type { ActiveTimer, TimeEntry } from "@/lib/types"

type AgentTimeInterval = {
  id: string
  start: string
  end: string
  project: string
  agents: string[]
  durationSeconds: number
  activitySeconds: number
  sources?: string[]
  sourceIntervals?: AgentTimeSourceInterval[]
  live?: boolean
}

type AgentTimeSourceInterval = {
  start: string
  end: string
  durationSeconds: number
  agent: string
  source: string
  model: string
  conversationId: string
  conversationTitle: string
  canonicalConversationId?: string
  conversationSummary?: string
  hostUrl?: string
  machineLabel?: string
}

type AgentTimeResponse = {
  projects: string[]
  intervals: AgentTimeInterval[]
}

type AgentImportSlice = {
  id: string
  interval: AgentTimeInterval
  projectId: string
  start: number
  end: number
  sourceStart: number
  sourceEnd: number
  durationSeconds: number
}
type AgentImportPlan = {
  overlaps: { key: string; projectId: string; start: number; end: number }[]
  slices: AgentImportSlice[]
  skippedSeconds: number
  ignoredSeconds: number
  unmappedProjects: string[]
  unmappedSeconds: number
  unmappedBlocks: number
}
type LogRow =
  | { kind: "entry"; entry: TimeEntry; date: string; sortKey: string }
  | { kind: "draft"; slice: AgentImportSlice; date: string; sortKey: string }
type IgnoredAgentRange = {
  id: string
  agentProject: string
  start: number
  end: number
}
const HARD_AGENT_TIME_START_DATE = "2026-08-30"
const DAILY_AGENT_GAP_KEY = "timetracker-agent-time-gap-today"
const IGNORED_AGENT_RANGES_KEY = "timetracker-agent-time-ignored-ranges"

function sourceDescription(interval: AgentTimeSourceInterval) {
  if (interval.source === "T3 Code") return `T3 Code using ${interval.agent}`
  return `${interval.source || interval.agent} directly`
}


type ConversationSource = ReturnType<typeof groupConversationSources>[number]

/** The chat that best represents a draft: the longest one with a title, else the longest overall. */
function primaryConversation(slice: AgentImportSlice) {
  const conversations = groupConversationSources(slice.interval.sourceIntervals ?? [], slice.start, slice.end)
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
  return conversations.find((conversation) => conversation.conversationTitle.trim()) ?? conversations[0] ?? null
}

function summaryKey(slice: AgentImportSlice) {
  const sources = groupConversationSources(slice.interval.sourceIntervals ?? [], slice.start, slice.end)
  return JSON.stringify([slice.start, slice.end, sources.map((s) => [s.hostUrl, s.source, s.conversationId]).sort()])
}

function draftDescription(slice: AgentImportSlice, summaries: Record<string, string> = {}) {
  const primary = primaryConversation(slice)
  return summaries[summaryKey(slice)] || primary?.conversationTitle.trim() || `Agent Time — ${slice.interval.agents.join(" + ") || "coding"}`
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

type TranscriptMessage = { role: "user" | "assistant"; text: string; at: string | null }
type Transcript = { source: string; conversationId: string; title: string; messages: TranscriptMessage[]; nextOffset?: number | null; totalMessages?: number }

function ChatTranscript({ source, onClose }: { source: ConversationSource; onClose: () => void }) {
  const [state, setState] = useState<{ key: string; transcript?: Transcript; error?: string } | null>(null)
  const key = `${source.hostUrl || ""}:${source.source}:${source.conversationId}`

  useEffect(() => {
    let cancelled = false
    const query = new URLSearchParams({ source: source.source, id: source.conversationId, host: source.hostUrl || "" })
    fetch(`/api/agent-time/transcript?${query.toString()}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { transcript?: Transcript; error?: string }
        if (cancelled) return
        if (!response.ok || !body.transcript) setState({ key, error: body.error || "Unable to read the chat." })
        else setState({ key, transcript: body.transcript })
      })
      .catch(() => { if (!cancelled) setState({ key, error: "Unable to read the chat." }) })
    return () => { cancelled = true }
  }, [source, key])

  const [loadingMore, setLoadingMore] = useState(false)
  async function loadMore() {
    if (state?.transcript?.nextOffset == null || loadingMore) return
    setLoadingMore(true)
    try {
      const query = new URLSearchParams({ source: source.source, id: source.conversationId, host: source.hostUrl || "", offset: String(state.transcript.nextOffset) })
      const response = await fetch(`/api/agent-time/transcript?${query}`)
      const body = await response.json() as { transcript?: Transcript; error?: string }
      if (!response.ok || !body.transcript) throw new Error(body.error || "Unable to load more messages")
      const next = body.transcript
      setState((current) => current?.key === key && current.transcript ? { ...current, transcript: { ...next, messages: [...current.transcript.messages, ...next.messages] } } : current)
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to load more messages") }
    finally { setLoadingMore(false) }
  }
  const title = state?.transcript?.title || source.conversationTitle || `${source.agent} conversation`
  const loading = !state || state.key !== key

  return <div className="min-w-0 overflow-hidden rounded-xl border bg-background" data-testid="agent-chat-panel">
    <div className="flex min-w-0 items-start gap-2.5 border-b px-3 py-2.5">
      <SourceLogo source={source.source} agent={source.agent} className="size-7" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug break-words">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{machineName(source)} · {sourceDescription(source)}{source.model ? ` · ${source.model}` : ""} · {formatDuration(source.durationSeconds)}</p>
      </div>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Close chat" onClick={onClose}><X className="size-3.5" /></Button>
    </div>
    <div className="max-h-[65dvh] min-w-0 overflow-y-auto overscroll-contain px-3 py-3">
      {loading && <div className="grid gap-3"><Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" /><Skeleton className="h-16 w-4/5 rounded-2xl" /><Skeleton className="ml-auto h-8 w-1/2 rounded-2xl" /></div>}
      {!loading && state?.error && <p className="py-6 text-center text-sm text-muted-foreground">{state.error}</p>}
      {!loading && state?.transcript && state.transcript.messages.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">This chat has no messages yet.</p>}
      {!loading && state?.transcript && state.transcript.messages.length > 0 && <div className="grid gap-3">
        {state.transcript.messages.map((message, index) => <div key={`${message.at ?? index}-${index}`} className={`flex min-w-0 flex-col ${message.role === "user" ? "items-end" : "items-start"}`}>
          <div className={`max-w-[92%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed sm:max-w-[85%] ${message.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted"}`}>{message.text}</div>
          {message.at && <span className="mt-1 px-1 font-mono text-[0.65rem] text-muted-foreground">{format(new Date(message.at), "MMM d, yyyy HH:mm:ss OOO")}</span>}
        </div>)}
      </div>}
      {state?.transcript?.nextOffset != null && <Button className="mt-4 w-full" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : `Load more messages (${state.transcript.messages.length} / ${state.transcript.totalMessages})`}</Button>}
    </div>
  </div>
}

function EntryChats({ description, sources, start, end, labels, inferred = false }: { description: string; sources: AgentTimeSourceInterval[]; start: number; end: number; labels: Record<string, string>; inferred?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [chat, setChat] = useState<ConversationSource | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const conversations = groupConversationSources(sources, start, end)
  const needle = query.trim().toLowerCase()
  const filtered = conversations.filter((source) => `${source.conversationTitle} ${source.conversationSummary || ""} ${machineName(source, labels)} ${source.source}`.toLowerCase().includes(needle))
  const pages = Math.max(1, Math.ceil(filtered.length / 5))
  const currentPage = Math.min(page, pages - 1)
  return <>
    <Popover open={open} onOpenChange={(value) => { setOpen(value); if (value) { setPage(0); setQuery("") } }}>
      <PopoverTrigger asChild><button ref={triggerRef} type="button" className="flex w-full min-w-0 cursor-pointer items-start gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring" data-testid="entry-chat-menu" aria-label={`Chats for ${description || "Untitled"}`}>
        <span className="min-w-0 flex-1 break-words">{description || "Untitled"}</span><ChevronDown className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
      </button></PopoverTrigger>
      <PopoverContent onCloseAutoFocus={(event) => { if (chat) event.preventDefault() }} align="start" collisionPadding={16} className="w-[min(28rem,calc(100vw-2rem))] gap-0 rounded-md p-0" data-testid="entry-chats-dropdown">
        <div className="border-b p-3">
          <p className="font-semibold">Chats in this entry <span className="font-normal text-muted-foreground">({conversations.length})</span></p>
          <p className="mt-1 text-xs text-muted-foreground">{inferred ? "Matched from available activity logs. Older entries did not save chat references." : "Activity contributing to this time entry."}</p>
          <Input className="mt-3 h-8 rounded-md" aria-label="Search entry chats" placeholder="Search chats or machines…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} />
        </div>
        <div className="max-h-[min(22rem,50vh)] overflow-y-auto p-1">
          {filtered.slice(currentPage * 5, currentPage * 5 + 5).map((source) => <button key={`${source.hostUrl}:${source.source}:${source.conversationId}`} type="button" className="flex w-full min-w-0 cursor-pointer items-start gap-2.5 rounded-md p-2.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onClick={() => { setChat({ ...source, machineLabel: machineName(source, labels) }); setOpen(false) }}>
            <SourceLogo source={source.agent} agent={source.agent} className="mt-0.5 size-5" />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-medium">{source.conversationTitle || source.conversationSummary || "Untitled chat"}</p>
              {source.conversationSummary && source.conversationSummary !== source.conversationTitle && <p className="mt-1 break-words text-xs text-muted-foreground">{source.conversationSummary}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"><span className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">{machineName(source, labels)}</span><span>{source.model || source.agent || source.source}</span><span className="font-mono">{formatDuration(source.durationSeconds)}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{new Date(source.spans[0].start).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "long" })} – {new Date(source.spans.at(-1)!.end).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "long" })}</p>
            </div>
            <MessageSquareText className="mt-1 size-4 shrink-0 text-muted-foreground" />
          </button>)}
          {filtered.length === 0 && <p className="p-4 text-sm text-muted-foreground">{query ? "No chats match this search." : "No chat references are available for this entry. Check that its source machine is connected."}</p>}
        </div>
        {pages > 1 && <div className="flex items-center justify-between border-t px-3 py-2 text-xs"><Button size="sm" variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><span>{currentPage + 1} / {pages}</span><Button size="sm" variant="ghost" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Next</Button></div>}
      </PopoverContent>
    </Popover>
    <Dialog open={!!chat} onOpenChange={(value) => { if (!value) setChat(null) }}><DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus() }} aria-describedby={undefined} showCloseButton={false} className="max-h-[90dvh] w-[calc(100vw-2rem)] min-w-0 overflow-hidden rounded-md p-0 sm:max-w-3xl"><DialogHeader className="sr-only"><DialogTitle>Chat transcript</DialogTitle></DialogHeader>{chat && <ChatTranscript source={chat} onClose={() => setChat(null)} />}</DialogContent></Dialog>
  </>
}

function mobileFixtureRequested() {
  return typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" &&
    new URLSearchParams(window.location.search).get("fixture") === "mobile"
}

function agentPreferenceStorageKey(key: string) {
  if (!mobileFixtureRequested()) return key
  const fixtureSession = new URLSearchParams(window.location.search).get("fixtureSession") || "default"
  return `${key}:fixture:${fixtureSession}`
}

function savedDailyAgentGap(today: string) {
  if (typeof window === "undefined") return "15"
  try {
    const saved = JSON.parse(localStorage.getItem(agentPreferenceStorageKey(DAILY_AGENT_GAP_KEY)) ?? "null") as { date?: string; minutes?: number } | null
    const minutes = saved?.minutes
    if (
      saved?.date === today &&
      typeof minutes === "number" &&
      Number.isFinite(minutes) &&
      minutes >= 0 &&
      minutes <= 240
    ) return String(Math.round(minutes))
  } catch {
    // Invalid preferences use the daily default.
  }
  return "15"
}

function savedIgnoredAgentRanges() {
  if (typeof window === "undefined") return []
  try {
    const saved = JSON.parse(localStorage.getItem(agentPreferenceStorageKey(IGNORED_AGENT_RANGES_KEY)) ?? "[]") as unknown
    if (!Array.isArray(saved)) return []
    return saved.filter((range): range is IgnoredAgentRange => {
      if (!range || typeof range !== "object") return false
      const candidate = range as Partial<IgnoredAgentRange>
      return typeof candidate.id === "string" &&
        typeof candidate.agentProject === "string" &&
        typeof candidate.start === "number" &&
        Number.isFinite(candidate.start) &&
        typeof candidate.end === "number" &&
        Number.isFinite(candidate.end) &&
        candidate.end > candidate.start
    })
  } catch {
    return []
  }
}

function persistIgnoredAgentRanges(ranges: IgnoredAgentRange[]) {
  try {
    localStorage.setItem(agentPreferenceStorageKey(IGNORED_AGENT_RANGES_KEY), JSON.stringify(ranges))
  } catch {
    // Ignoring still applies until this page is refreshed.
  }
}

function buildAgentImportPlan(
  intervals: AgentTimeInterval[],
  projectMappings: Record<string, string>,
  timeEntries: TimeEntry[],
  cutoff: number | null,
  ignoredRanges: IgnoredAgentRange[] = [],
  activeTimers: ActiveTimer[] = [],
  maxMinutes?: number | null
): AgentImportPlan {
  const occupiedByProject = new Map<string, TimeRange[]>()
  for (const projectId of new Set([...timeEntries, ...activeTimers].map((entry) => entry.projectId))) {
    occupiedByProject.set(projectId, occupiedProjectRanges(projectId, timeEntries, activeTimers))
  }

  const slices: AgentImportSlice[] = []
  const unmappedProjects = new Set<string>()
  let skippedSeconds = 0
  const overlapReviewRanges = new Map<string, { key: string; projectId: string; start: number; end: number }>()
  let ignoredSeconds = 0
  let unmappedSeconds = 0
  let unmappedBlocks = 0
  for (const interval of [...intervals].sort((a, b) => +new Date(a.start) - +new Date(b.start))) {
    const sourceStart = Math.max(new Date(interval.start).getTime(), cutoff ?? -Infinity)
    const sourceEnd = new Date(interval.end).getTime()
    if (Number.isNaN(sourceStart) || Number.isNaN(sourceEnd) || sourceEnd <= sourceStart) continue

    const projectId = projectMappings[interval.project]
    if (projectId === PERSONAL_AGENT_PROJECT) continue
    if (!projectId) {
      unmappedProjects.add(interval.project)
      unmappedSeconds += Math.floor((sourceEnd - sourceStart) / 1000)
      unmappedBlocks++
      continue
    }

    const occupied = occupiedByProject.get(projectId) ?? []
    const trackedGaps = subtractRanges({ start: sourceStart, end: sourceEnd }, occupied)
    for (const overlap of subtractRanges({ start: sourceStart, end: sourceEnd }, trackedGaps)) {
      const key = `${projectId}:${overlap.start}:${overlap.end}`
      overlapReviewRanges.set(key, { key, projectId, ...overlap })
    }
    const trackedUncoveredSeconds = trackedGaps.reduce(
      (total, gap) => total + Math.floor((gap.end - gap.start) / 1000),
      0
    )
    skippedSeconds += Math.floor((sourceEnd - sourceStart) / 1000) - trackedUncoveredSeconds
    const ignoredForProject = ignoredRanges
      .filter((range) => range.agentProject === interval.project)
      .map((range) => ({ start: range.start, end: range.end }))
    const gaps = trackedGaps.flatMap((gap) => subtractRanges(gap, ignoredForProject))
    const finalUncoveredSeconds = gaps.reduce(
      (total, gap) => total + Math.floor((gap.end - gap.start) / 1000),
      0
    )
    ignoredSeconds += trackedUncoveredSeconds - finalUncoveredSeconds

    for (const gap of gaps.flatMap((range) => splitAgentRange(range, maxMinutes))) {
      slices.push({
        id: `${interval.id}-${gap.start}-${gap.end}`,
        interval,
        projectId,
        start: gap.start,
        end: gap.end,
        sourceStart,
        sourceEnd,
        durationSeconds: Math.floor((gap.end - gap.start) / 1000),
      })
      occupied.push(gap)
    }
    occupiedByProject.set(projectId, occupied)
  }

  return {
    slices,
    overlaps: [...overlapReviewRanges.values()],
    skippedSeconds,
    ignoredSeconds,
    unmappedProjects: [...unmappedProjects].sort(),
    unmappedSeconds,
    unmappedBlocks,
  }
}

function LiveTimer({
  startTime,
  pausedAt,
  accumulatedPause = 0,
}: {
  startTime: string
  pausedAt?: string | null
  accumulatedPause?: number
}) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    function tick() {
      const now = Date.now()
      const total = Math.floor((now - new Date(startTime).getTime()) / 1000)
      let paused = accumulatedPause
      if (pausedAt) {
        paused += Math.floor((now - new Date(pausedAt).getTime()) / 1000)
      }
      setElapsed(Math.max(0, total - paused))
    }
    tick()
    // If paused, no need to tick every second
    if (pausedAt) return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startTime, pausedAt, accumulatedPause])

  return (
    <span className="font-mono text-3xl font-bold tabular-nums tracking-tight">
      {formatDuration(elapsed)}
    </span>
  )
}

function TodayTotal({
  completedSeconds,
  activeTimers,
}: {
  completedSeconds: number
  activeTimers: ActiveTimer[]
}) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    function tick() {
      setNow(Date.now())
    }

    tick()
    if (!activeTimers.some((timer) => !timer.pausedAt)) return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeTimers])

  const activeSeconds = now === null ? 0 : activeTimers.reduce((total, timer) => {
    const startedAt = new Date(timer.startTime).getTime()
    const endedAt = timer.pausedAt ? new Date(timer.pausedAt).getTime() : now
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return total
    return total + Math.max(0, Math.floor((endedAt - startedAt) / 1000) - (timer.accumulatedPause ?? 0))
  }, 0)

  return (
    <span data-testid="today-total" className="font-mono text-xs font-semibold tabular-nums text-foreground">
      {formatDuration(completedSeconds + activeSeconds)}
    </span>
  )
}

function ImportProjectPicker({ value, onChange, choices }: { value: string; onChange: (value: string) => void; choices: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false)
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="outline" role="combobox" aria-expanded={open} className="w-full min-w-0 justify-between"><span className="truncate">{choices.find((choice) => choice.value === value)?.label ?? "Choose client / project"}</span><ChevronsUpDown className="ml-2 size-4 shrink-0" /></Button></PopoverTrigger>
    <PopoverContent className="w-[min(24rem,calc(100vw-3rem))] p-1" align="start"><Command><CommandInput placeholder="Search clients and projects…" /><CommandList><CommandEmpty>No matching projects.</CommandEmpty><CommandGroup>{choices.map((choice) => <CommandItem key={choice.value} value={choice.value + " " + choice.label} onSelect={() => { onChange(choice.value); setOpen(false) }}><Check className={`size-4 ${choice.value === value ? "opacity-100" : "opacity-0"}`} /><span className="min-w-0 break-words">{choice.label}</span></CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent>
  </Popover>
}

export default function TrackerPage() {
  const {
    data,
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    clearTimer,
    updateTimeEntry,
    deleteTimeEntry,
    addTimeEntry,
    updateProject,
    getClient,
    getProject,
  } = useStore()
  const todayEntryDate = localDateString(new Date(), data.settings.timezone)

  const [timerProject, setTimerProject] = useState("")
  const [timerDesc, setTimerDesc] = useState("")
  const [timerBillable, setTimerBillable] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null)
  const [editDraft, setEditDraft] = useState<AgentImportSlice | null>(null)
  const [editForm, setEditForm] = useState({
    description: "",
    projectId: "",
    startTime: "",
    endTime: "",
    billable: true,
    date: new Date(),
  })

  const [deleteTarget, setDeleteTarget] = useState<TimeEntry | null>(null)
  const [projectEdit, setProjectEdit] = useState<{ id: string; name: string; rate: string } | null>(null)
  const [addHoursOpen, setAddHoursOpen] = useState(false)
  const [hoursForm, setHoursForm] = useState({
    projectId: "",
    description: "",
    date: localDateString(new Date(), data.settings.timezone),
    hours: "",
    billable: true,
  })
  const [agentTime, setAgentTime] = useState<AgentTimeResponse | null>(null)
  const [agentTimeLoading, setAgentTimeLoading] = useState(false)
  const [gapMinutes, setGapMinutes] = useState("15")
  const [appliedGapMinutes, setAppliedGapMinutes] = useState("15")
  const [ignoredAgentRanges, setIgnoredAgentRanges] = useState<IgnoredAgentRange[]>([])
  const [reviewedAgentOverlaps, setReviewedAgentOverlaps] = useState<string[]>([])
  const [reviewedEntryOverlaps, setReviewedEntryOverlaps] = useState<string[]>([])
  const [reviewEntryOverlapsOpen, setReviewEntryOverlapsOpen] = useState(false)
  const jumpToEntry = useRef<string | null>(null)
  const [highlightedEntry, setHighlightedEntry] = useState<string | null>(null)
  useEffect(() => {
    if (!highlightedEntry) return
    const timeout = window.setTimeout(() => setHighlightedEntry(null), 4500)
    return () => window.clearTimeout(timeout)
  }, [highlightedEntry])
  const [reviewAgentOverlapsOpen, setReviewAgentOverlapsOpen] = useState(false)
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [importSettingsOpen, setImportSettingsOpen] = useState(false)
  const [chatSummaries, setChatSummaries] = useState<Record<string, string>>({})
  const requestedSummaries = useRef(new Set<string>())
  const [projectMappings, setProjectMappings] = useState<Record<string, string>>(() => {
    if (mobileFixtureRequested()) return { "Fixture Project": "fixture-project" }
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("timetracker-agent-time-project-mappings") : null
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })
  const [agentTimeStartDate, setAgentTimeStartDate] = useState<string | null>(() => {
    try {
      return typeof window !== "undefined" ? localStorage.getItem("timetracker-agent-time-start-date") : null
    } catch {
      return null
    }
  })
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)

  const activeTimers = data.activeTimers

  // Load a quiet status snapshot on arrival so forgotten Agent Time is visible
  // without making the user open the import flow first.
  useEffect(() => {
    const savedGap = savedDailyAgentGap(todayEntryDate)
    const savedIgnoredRanges = savedIgnoredAgentRanges()
    const id = window.setTimeout(() => {
      try {
        const readReviews = (key: string): string[] => {
          const value: unknown = JSON.parse(localStorage.getItem(agentPreferenceStorageKey(key)) || "[]")
          return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
        }
        setReviewedAgentOverlaps(readReviews("timetracker-reviewed-agent-overlaps"))
        setReviewedEntryOverlaps(readReviews("timetracker-reviewed-entry-overlaps"))
      } catch {
        // The notice can still be dismissed for this page when storage is unavailable.
      }
      setGapMinutes(savedGap)
      setAppliedGapMinutes(savedGap)
      setIgnoredAgentRanges(savedIgnoredRanges)
      void loadAgentTime(true, savedGap)
    }, 0)
    return () => window.clearTimeout(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function saveProjectMapping(agentProject: string, projectId: string) {
    setProjectMappings((current) => {
      const next = { ...current, [agentProject]: projectId }
      localStorage.setItem("timetracker-agent-time-project-mappings", JSON.stringify(next))
      return next
    })
  }

  function startWatchingAgentTimeToday() {
    const today = localDateString(new Date(), data.settings.timezone)
    localStorage.setItem("timetracker-agent-time-start-date", today)
    setAgentTimeStartDate(today)
    toast.success("Agent Time before today is now ignored")
  }

  function showAllAgentTime() {
    localStorage.removeItem("timetracker-agent-time-start-date")
    setAgentTimeStartDate(null)
    toast("Showing Agent Time from Aug 30, 2026")
  }

  const effectiveAgentTimeStartDate = agentTimeStartDate && agentTimeStartDate > HARD_AGENT_TIME_START_DATE
    ? agentTimeStartDate
    : HARD_AGENT_TIME_START_DATE

  const agentTimeCutoff = useMemo(() => {
    const cutoff = new Date(`${effectiveAgentTimeStartDate}T00:00:00`).getTime()
    return Number.isNaN(cutoff) ? null : cutoff
  }, [effectiveAgentTimeStartDate])

  const availableAgentIntervals = useMemo(
    () => agentTime?.intervals.filter((interval) => !agentTimeCutoff || new Date(interval.end).getTime() > agentTimeCutoff) ?? [],
    [agentTime, agentTimeCutoff]
  )

  function sourcesForEntry(entry: TimeEntry): AgentTimeSourceInterval[] {
    const start = Date.parse(entry.startTime)
    const end = entry.endTime ? Date.parse(entry.endTime) : NaN
    if (!Number.isFinite(start) || !Number.isFinite(end)) return []
    if (entry.agentTimeSources?.length) {
      const current = (agentTime?.intervals || []).flatMap((interval) => interval.sourceIntervals || [])
      return clipAgentSources(entry.agentTimeSources.map((source) => {
        const match = current.find((candidate) => candidate.hostUrl === source.hostUrl && candidate.source === source.source && candidate.conversationId === source.conversationId)
        return { ...source, canonicalConversationId: match?.canonicalConversationId || source.canonicalConversationId }
      }), start, end)
    }
    const project = getProject(entry.projectId)
    const intervals = (agentTime?.intervals || []).filter((interval) =>
      projectMappings[interval.project] === entry.projectId || interval.project === project?.name ||
      interval.sourceIntervals?.some((source) => (source.conversationSummary || source.conversationTitle) === entry.description)
    )
    return clipAgentSources(intervals.flatMap((interval) => interval.sourceIntervals || []), start, end)
  }
  function machineNames(sources: AgentTimeSourceInterval[]) {
    return [...new Set(sources.map((source) => machineName(source, data.settings.agentTimeHostLabels)))].join(", ") || "—"
  }

  const agentImportPreview = useMemo(
    () => buildAgentImportPlan(
      availableAgentIntervals,
      projectMappings,
      data.timeEntries,
      agentTimeCutoff,
      ignoredAgentRanges,
      data.activeTimers,
      data.settings.agentTimeMaxMinutes
    ),
    [agentTimeCutoff, availableAgentIntervals, data.timeEntries, data.activeTimers, data.settings.agentTimeMaxMinutes, ignoredAgentRanges, projectMappings]
  )
  function saveOverlapReviews(kind: "agent" | "entry", keys: string[]) {
    if (kind === "agent") setReviewedAgentOverlaps(keys)
    else setReviewedEntryOverlaps(keys)
    try {
      localStorage.setItem(agentPreferenceStorageKey(`timetracker-reviewed-${kind}-overlaps`), JSON.stringify(keys))
    } catch {
      // Reviews still apply for this page when browser storage is unavailable.
    }
  }
  const pendingAgentOverlaps = agentImportPreview.overlaps.filter((overlap) => !reviewedAgentOverlaps.includes(overlap.key))

  const agentImportPreviewSeconds = agentImportPreview.slices.reduce(
    (total, slice) => total + slice.durationSeconds,
    0
  )
  const unmappedAgentProjects = agentImportPreview.unmappedProjects
  const handledAgentProjects = useMemo(
    () => [...new Set(availableAgentIntervals.map((interval) => interval.project))]
      .filter((project) => !unmappedAgentProjects.includes(project))
      .sort((a, b) => a.localeCompare(b)),
    [availableAgentIntervals, unmappedAgentProjects]
  )

  async function loadAgentTime(silent = false, gapOverride = appliedGapMinutes) {
    setAgentTimeLoading(true)
    try {
      const requestedGap = Number(gapOverride)
      const gap = Number.isFinite(requestedGap)
        ? Math.max(0, Math.min(240, Math.round(requestedGap)))
        : 15
      const fixture = mobileFixtureRequested() ? "&fixture=mobile" : ""
      const response = await fetch(`/api/agent-time?gapMinutes=${gap}&from=${HARD_AGENT_TIME_START_DATE}${fixture}`)
      if (!response.ok) throw new Error("Agent Time is not available")
      const payload = (await response.json()) as AgentTimeResponse
      setAgentTime(payload)
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not load Agent Time")
    } finally {
      setAgentTimeLoading(false)
    }
  }

  function applyGapMinutes() {
    const requestedGap = Number(gapMinutes)
    if (!Number.isFinite(requestedGap) || requestedGap < 0 || requestedGap > 240) {
      toast.error("Choose a gap from 0 to 240 minutes")
      return
    }

    const normalizedGap = String(Math.round(requestedGap))
    setGapMinutes(normalizedGap)
    setAppliedGapMinutes(normalizedGap)
    try {
      localStorage.setItem(agentPreferenceStorageKey(DAILY_AGENT_GAP_KEY), JSON.stringify({
        date: todayEntryDate,
        minutes: Number(normalizedGap),
      }))
    } catch {
      // The current page still uses the choice when browser storage is unavailable.
    }
    toast.success(`Agent Time gap set to ${normalizedGap} ${normalizedGap === "1" ? "minute" : "minutes"} for today`)
    void loadAgentTime(false, normalizedGap)
  }

  const importInFlight = useRef(false)
  const importedEntries = useRef<TimeEntry[]>([])
  const latestData = useRef(data)
  latestData.current = data
  useEffect(() => {
    const savedIds = new Set(data.timeEntries.map((entry) => entry.id))
    importedEntries.current = importedEntries.current.filter((entry) => !savedIds.has(entry.id))
  }, [data.timeEntries])
  const [importing, setImporting] = useState(false)
  const overlapDetails = entryOverlapDetails(data.timeEntries, data.activeTimers)
  const entryOverlapKeys = new Map([...overlapDetails].map(([id, details]) => [id, details.reviewKey]))
  const overlapIds = new Set([...entryOverlapKeys].filter(([, key]) => !reviewedEntryOverlaps.includes(key)).map(([id]) => id))

  async function importDraftEntries(entries: Omit<TimeEntry, "id">[], generateTitles = true) {
    if (importInFlight.current) return false
    importInFlight.current = true
    setImporting(true)
    let seconds = 0
    try {
      for (const entry of entries) {
        const current = latestData.current
        const gaps = subtractRanges(
          { start: Date.parse(entry.startTime), end: Date.parse(entry.endTime!) },
          occupiedProjectRanges(entry.projectId, [...current.timeEntries, ...importedEntries.current], current.activeTimers)
        )
        for (const gap of gaps.flatMap((range) => splitAgentRange(range, current.settings.agentTimeMaxMinutes))) {
          const duration = Math.floor((gap.end - gap.start) / 1000)
          if (duration <= 0) continue
          let description = entry.description
          const sources = groupConversationSources(entry.agentTimeSources || [], gap.start, gap.end).filter((source) => source.conversationId)
          if (generateTitles && sources.length) {
            const response = await fetch("/api/agent-time/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start: new Date(gap.start).toISOString(), end: new Date(gap.end).toISOString(), sources }) })
            if (!response.ok) throw new Error("Interval title generation failed")
            const result = await response.json() as { title?: string | null }
            description = result.title || sources[0].conversationTitle || description
          }
          const saved = await addTimeEntry({
            ...entry,
            description,
            agentTimeSources: clipAgentSources(entry.agentTimeSources || [], gap.start, gap.end),
            startTime: new Date(gap.start).toISOString(),
            endTime: new Date(gap.end).toISOString(),
            duration,
            date: localDateString(new Date(gap.start), current.settings.timezone),
          })
          importedEntries.current.push(saved)
          seconds += duration
        }
      }
      if (seconds) toast.success(`Approved ${formatDuration(seconds)}. Overlapping time excluded.`)
      else toast.error("No time imported: this time is already tracked or reserved by an active timer.")
      return true
    } catch {
      toast.error("Import could not finish. Any entries already saved are protected from re-import; retry the remaining drafts.")
      return false
    } finally {
      importInFlight.current = false
      setImporting(false)
    }
  }

  function draftEntry(slice: AgentImportSlice): Omit<TimeEntry, "id"> {
    return {
      projectId: slice.projectId,
      description: draftDescription(slice, chatSummaries),
      agentTimeSources: clipAgentSources(slice.interval.sourceIntervals || [], slice.start, slice.end),
      startTime: new Date(slice.start).toISOString(),
      endTime: new Date(slice.end).toISOString(),
      duration: slice.durationSeconds,
      billable: true,
      date: localDateString(new Date(slice.start), data.settings.timezone),
    }
  }

  async function approveDraft(slice: AgentImportSlice) {
    if (!await importDraftEntries([draftEntry(slice)])) return
  }

  async function approveAllDrafts() {
    if (!await importDraftEntries(agentImportPreview.slices.map(draftEntry))) return
  }

  async function saveHoursOnly() {
    const duration = Math.round(Number(hoursForm.hours) * 3600)
    if (!hoursForm.projectId || !hoursForm.date || !Number.isFinite(duration) || duration <= 0) {
      toast.error("Choose a project, date, and positive number of hours")
      return
    }
    // A stable noon timestamp preserves ordering while keeping this a duration-only entry.
    const syntheticStart = new Date(`${hoursForm.date}T12:00:00`)
    await addTimeEntry({
      projectId: hoursForm.projectId,
      description: hoursForm.description,
      startTime: syntheticStart.toISOString(),
      endTime: null,
      duration,
      billable: hoursForm.billable,
      date: hoursForm.date,
    })
    toast.success(`Added ${formatHours(duration)}h`)
    setAddHoursOpen(false)
    setHoursForm((current) => ({ ...current, description: "", hours: "" }))
  }

  function handleStart() {
    if (!timerProject) {
      toast.error("Select a project first")
      return
    }
    startTimer({
      id: crypto.randomUUID(),
      projectId: timerProject,
      description: timerDesc,
      startTime: new Date().toISOString(),
      billable: timerBillable,
    })
    toast.success("Timer started")
  }

  async function handleStop(id: string) {
    const entry = await stopTimer(id)
    if (entry) {
      toast.success(`Tracked ${formatHours(entry.duration)}h`)
    }
    setTimerDesc("")
  }

  function handleDiscard(id: string) {
    clearTimer(id)
    toast("Timer discarded")
  }

  function handleResume(entry: TimeEntry) {
    const project = getProject(entry.projectId)
    if (!project || project.status !== "active") {
      toast.error("Project is not active")
      return
    }
    startTimer({
      id: crypto.randomUUID(),
      projectId: entry.projectId,
      description: entry.description,
      startTime: new Date().toISOString(),
      billable: entry.billable,
    })
    // Bump the source entry to today so it sits under today's divider and you
    // don't have to scroll back to last week to resume it again next time.
    const today = localDateString(new Date(), data.settings.timezone)
    if (entry.date !== today) {
      updateTimeEntry(entry.id, { date: today })
    }
    setTimerProject(entry.projectId)
    setTimerDesc(entry.description)
    setTimerBillable(entry.billable)
    toast.success(`Started: ${entry.description || project.name}`)
  }

  function openDraftEdit(slice: AgentImportSlice) {
    setEditEntry(null)
    setEditDraft(slice)
    setEditForm({
      description: draftDescription(slice, chatSummaries),
      projectId: slice.projectId,
      startTime: new Date(slice.start).toISOString(),
      endTime: new Date(slice.end).toISOString(),
      billable: true,
      date: new Date(slice.start),
    })
    setEditOpen(true)
  }

  function openEdit(entry: TimeEntry) {
    setEditDraft(null)
    setEditEntry(entry)
    setEditForm({
      description: entry.description,
      projectId: entry.projectId,
      startTime: entry.startTime || "",
      endTime: entry.endTime || "",
      billable: entry.billable,
      date: parseLocalDate(entry.date),
    })
    setEditOpen(true)
  }

  const editDuration = useMemo(() => {
    if (!editForm.startTime || !editForm.endTime) return 0
    const start = new Date(editForm.startTime).getTime()
    const end = new Date(editForm.endTime).getTime()
    if (isNaN(start) || isNaN(end) || end <= start) return 0
    return Math.floor((end - start) / 1000)
  }, [editForm.startTime, editForm.endTime])

  async function handleEditSave() {
    if (!editEntry && !editDraft) return
    if (!editForm.projectId) {
      toast.error("Select a project")
      return
    }
    if (editDuration <= 0) {
      toast.error("End time must be after start time")
      return
    }
    const startDt = new Date(editForm.startTime)
    const endDt = new Date(editForm.endTime)
    const dateStr = localDateString(editDraft ? startDt : new Date(), data.settings.timezone)
    const values = {
      description: editForm.description,
      projectId: editForm.projectId,
      startTime: startDt.toISOString(),
      endTime: endDt.toISOString(),
      duration: editDuration,
      billable: editForm.billable,
      date: dateStr,
    }

    if (editDraft) {
      if (!await importDraftEntries([{ ...values, agentTimeSources: clipAgentSources(editDraft.interval.sourceIntervals || [], startDt.getTime(), endDt.getTime()) }], false)) return
    } else if (editEntry) {
      await updateTimeEntry(editEntry.id, values)
      toast.success("Entry updated")
    }
    setEditOpen(false)
    setEditEntry(null)
    setEditDraft(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await deleteTimeEntry(deleteTarget.id)
    toast.success("Entry deleted")
    setDeleteTarget(null)
  }

  const todayCompletedSeconds = useMemo(
    () => data.timeEntries
      .filter((entry) => entry.date === todayEntryDate)
      .reduce((total, entry) => total + entry.duration, 0),
    [data.timeEntries, todayEntryDate]
  )

  const logRows = useMemo(() => {
    const rows: LogRow[] = data.timeEntries.map((entry) => ({ kind: "entry", entry, date: entry.date, sortKey: `${entry.date}${entry.startTime ?? ""}` }))
    for (const slice of agentImportPreview.slices) {
      const start = new Date(slice.start)
      const date = localDateString(start, data.settings.timezone)
      rows.push({ kind: "draft", slice, date, sortKey: `${date}${start.toISOString()}` })
    }
    return rows.sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  }, [agentImportPreview.slices, data.settings.timezone, data.timeEntries])

  // Generate a separate title from the messages within each interval.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const slice of agentImportPreview.slices) {
        if (cancelled) break
        const key = summaryKey(slice)
        if (requestedSummaries.current.has(key)) continue
        const sources = groupConversationSources(slice.interval.sourceIntervals ?? [], slice.start, slice.end).filter((s) => s.conversationId)
        if (!sources.length) continue
        requestedSummaries.current.add(key)
        try {
          const response = await fetch("/api/agent-time/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start: new Date(slice.start).toISOString(), end: new Date(slice.end).toISOString(), sources }) })
          if (!response.ok) { requestedSummaries.current.delete(key); continue }
          const body = await response.json() as { title?: string | null }
          if (body.title) setChatSummaries((current) => ({ ...current, [key]: body.title as string }))
        } catch {
          requestedSummaries.current.delete(key)
        }
      }
    })()
    return () => { cancelled = true }
  }, [agentImportPreview.slices])

  function restoreVisibleIgnoredAgentRanges() {
    setIgnoredAgentRanges((current) => {
      const next = current.filter((range) => !availableAgentIntervals.some((interval) => {
        if (interval.project !== range.agentProject) return false
        const intervalStart = new Date(interval.start).getTime()
        const intervalEnd = new Date(interval.end).getTime()
        return Number.isFinite(intervalStart) && Number.isFinite(intervalEnd) && range.end > intervalStart && range.start < intervalEnd
      }))
      persistIgnoredAgentRanges(next)
      return next
    })
    toast.success("Skipped Agent Time restored")
  }

  function ignoreAgentSlice(slice: AgentImportSlice) {
    const ignoredRange: IgnoredAgentRange = {
      id: `${slice.interval.project}:${slice.start}:${slice.end}`,
      agentProject: slice.interval.project,
      start: slice.start,
      end: slice.end,
    }
    setIgnoredAgentRanges((current) => {
      if (current.some((range) => range.id === ignoredRange.id)) return current
      const next = [...current, ignoredRange]
      persistIgnoredAgentRanges(next)
      return next
    })
    toast("Skipped", {
      description: `${format(new Date(slice.start), "MMM d, h:mm a")} – ${format(new Date(slice.end), "h:mm a")}`,
    })
  }

  async function saveProjectEdit() {
    if (!projectEdit?.name.trim()) return
    await updateProject(projectEdit.id, {
      name: projectEdit.name.trim(),
      rate: Number(projectEdit.rate) || 0,
    })
    toast.success("Project updated")
    setProjectEdit(null)
  }

  return (
    <>
      <PageHeader
        title="Time Tracker"
        description="Track each work session as its own entry"
      />

      <Card className="mb-6">
        <CardContent className="pt-5">
          {data.projects.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Create a client and project first to start tracking time
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_260px_auto_auto] sm:items-center">
                <Input
                  data-testid="timer-description"
                  placeholder="What are you working on?"
                  value={timerDesc}
                  onChange={(e) => setTimerDesc(e.target.value)}
                  className="h-10 min-w-0 w-full"
                />
                <Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button data-testid="timer-project-picker" variant="outline" role="combobox" aria-expanded={projectPickerOpen} className="h-10 min-w-0 w-full justify-between" >
                      <span className="truncate">{timerProject ? (() => { const project = getProject(timerProject); const client = project ? getClient(project.clientId) : undefined; return project ? `${client?.name ? `${client.name} — ` : ""}${project.name}` : "Select project" })() : "Select project"}</span>
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-1">
                    <Command>
                      <CommandInput placeholder="Search projects or clients…" />
                      <CommandList>
                        <CommandEmpty>No active project found.</CommandEmpty>
                        <CommandGroup>
                          {data.projects.filter((project) => project.status === "active").map((project) => {
                            const client = getClient(project.clientId)
                            return <CommandItem key={project.id} value={`${project.name} ${client?.name ?? ""}`} onSelect={() => { setTimerProject(project.id); setProjectPickerOpen(false) }}><span className="min-w-0"><span className="block truncate">{project.name}</span>{client && <span className="block truncate text-xs text-muted-foreground">{client.name}</span>}</span></CommandItem>
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <div className="flex h-10 items-center gap-1.5">
                  <Checkbox
                    data-testid="timer-billable"
                    id="timer-billable"
                    checked={timerBillable}
                    onCheckedChange={(v) => setTimerBillable(v === true)}
                  />
                  <Label
                    htmlFor="timer-billable"
                    className="text-xs text-muted-foreground"
                  >
                    Billable
                  </Label>
                </div>
                <Button
                  data-testid="timer-start"
                  onClick={handleStart}
                  className="w-full bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600 sm:w-auto"
                >
                  <Play className="size-3.5" data-icon="inline-start" />
                  Start timer
                </Button>
              </div>

              {activeTimers.length === 0 ? <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"><Clock className="size-5" />No active timers</div> : <div className="grid gap-2">{activeTimers.map((timer) => {
                const project = getProject(timer.projectId)
                return <div key={timer.id} data-testid="active-timer" className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                  <Clock className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-[9rem] flex-1"><p className="font-medium">{timer.description || project?.name || "Untitled"}</p><p className="text-xs text-muted-foreground">{project?.name ?? "Unknown project"}</p></div>
                  <LiveTimer startTime={timer.startTime} pausedAt={timer.pausedAt} accumulatedPause={timer.accumulatedPause} />
                  {timer.pausedAt && <Badge variant="secondary" className="animate-pulse text-xs">Paused</Badge>}
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" onClick={() => handleDiscard(timer.id)}>Discard</Button>
                    {timer.pausedAt ? <Button onClick={() => resumeTimer(timer.id)} className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"><Play className="size-3.5" data-icon="inline-start" />Resume</Button> : <Button onClick={() => pauseTimer(timer.id)} variant="outline"><Pause className="size-3.5" data-icon="inline-start" />Pause</Button>}
                    <Button onClick={() => handleStop(timer.id)} className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"><Square className="size-3.5" data-icon="inline-start" />Stop</Button>
                  </div>
                </div>
              })}</div>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-medium">Time Log</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {agentImportPreview.slices.length > 0 && <Button
              size="sm"
              data-testid="approve-all-drafts"
              className="bg-amber-500 text-amber-950 hover:bg-amber-400 dark:bg-amber-400 dark:hover:bg-amber-300"
              onClick={() => void approveAllDrafts()}
              disabled={agentTimeLoading || importing}
            >
              <Check className="size-3.5" data-icon="inline-start" />
              Approve {agentImportPreview.slices.length} {agentImportPreview.slices.length === 1 ? "draft" : "drafts"} · <span className="font-mono">{formatDuration(agentImportPreviewSeconds)}</span>
            </Button>}
            <Button variant="outline" size="sm" onClick={() => setAddHoursOpen(true)}>
              <Plus className="size-3.5" data-icon="inline-start" />
              Add hours
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <div data-testid="agent-time-controls" className="mb-3 flex min-w-0 flex-wrap items-center gap-1 border-b pb-3">
            <Button type="button" variant="ghost" size="sm" data-testid="review-saved-overlaps" onClick={() => setReviewEntryOverlapsOpen(true)}>Saved conflicts{overlapIds.size > 0 && <span className="ml-1 rounded bg-muted px-1.5 text-xs tabular-nums">{overlapIds.size}</span>}</Button>
            <Button type="button" variant="ghost" size="sm" data-testid="review-agent-overlaps" onClick={() => setReviewAgentOverlapsOpen(true)}>Excluded time</Button>
            <Button type="button" variant="ghost" size="sm" data-testid="review-agent-projects" onClick={() => setProjectsOpen(true)}>Projects</Button>
            <Button type="button" variant="ghost" size="sm" data-testid="import-settings" onClick={() => setImportSettingsOpen(true)}>Import settings</Button>
          </div>
          {logRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No time entries yet</p>
          ) : (
            <div className="overflow-hidden rounded-xl border [&_[data-slot=table-container]]:overflow-x-hidden">
              <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sm:w-[30%]">Description</TableHead>
                <TableHead className="hidden sm:table-cell">Machine</TableHead>
                <TableHead className="hidden w-[18%] sm:table-cell">Project</TableHead>
                <TableHead className="hidden w-[12%] sm:table-cell">Date</TableHead>
                <TableHead className="hidden min-w-28 sm:table-cell">Start / End</TableHead>
                <TableHead className="hidden w-24 sm:table-cell">Duration</TableHead>
                <TableHead className="hidden w-[6.5rem] sm:table-cell">Amount</TableHead>
                <TableHead className="w-px sm:w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {logRows[0]?.date !== todayEntryDate && <TableRow className="bg-muted/35 hover:bg-muted/35"><TableCell colSpan={8} className="py-2 whitespace-normal"><div className="flex min-w-0 items-center justify-between gap-3 text-xs font-semibold text-muted-foreground"><span>Today</span><span className="inline-flex items-center gap-2"><span>Today&apos;s total</span><TodayTotal completedSeconds={todayCompletedSeconds} activeTimers={activeTimers} /></span></div></TableCell></TableRow>}
              {logRows.map((row, index) => {
                const isNewDay = index === 0 || row.date !== logRows[index - 1]?.date
                const isToday = row.date === todayEntryDate
                const dayLabel = isToday ? "Today" : format(parseLocalDate(row.date), "EEEE, MMMM d, yyyy")
                const dayHeader = isNewDay && <TableRow className="bg-muted/35 hover:bg-muted/35"><TableCell colSpan={8} className="py-2 whitespace-normal"><div className="flex w-0 min-w-full items-center justify-between gap-3 text-xs font-semibold text-muted-foreground"><span className="truncate">{dayLabel}</span>{isToday && <span className="inline-flex items-center gap-2"><span>Today&apos;s total</span><TodayTotal completedSeconds={todayCompletedSeconds} activeTimers={activeTimers} /></span>}</div></TableCell></TableRow>
                if (row.kind === "draft") {
                  const slice = row.slice
                  const project = getProject(slice.projectId)
                  const amount = project ? (slice.durationSeconds / 3600) * project.rate : 0
                  return <Fragment key={slice.id}>
                    {dayHeader}
                    <TableRow data-testid="agent-draft-row" className="bg-amber-500/[0.07] hover:bg-amber-500/[0.11]">
                      <TableCell className="font-medium whitespace-normal break-words">
                        <EntryChats description={draftDescription(slice, chatSummaries)} sources={slice.interval.sourceIntervals || []} start={slice.start} end={slice.end} labels={data.settings.agentTimeHostLabels || {}} />
                        <p className="mt-1 text-xs font-normal text-muted-foreground sm:hidden">{machineNames(clipAgentSources(slice.interval.sourceIntervals || [], slice.start, slice.end))}</p>
                        <p className="mt-0.5 whitespace-normal text-[0.7rem] font-normal text-muted-foreground sm:hidden"><span className="font-mono text-amber-700 dark:text-amber-300">{formatDuration(slice.durationSeconds)}</span> · {project?.name ?? "—"} · {format(new Date(slice.start), "MMM d, h:mm a")}–{format(new Date(slice.end), "h:mm a")}{amount ? ` · ${formatCurrency(amount, project?.currency)}` : ""}</p>
                      </TableCell>
                      <TableCell className="hidden whitespace-normal text-xs sm:table-cell">{machineNames(clipAgentSources(slice.interval.sourceIntervals || [], slice.start, slice.end))}</TableCell>
                      <TableCell className="hidden whitespace-normal sm:table-cell"><span className="block text-xs text-muted-foreground">{project?.name ?? "—"}</span></TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{format(new Date(slice.start), "MMM d, yyyy")}</TableCell>
                      <TableCell className="hidden font-mono text-xs whitespace-normal sm:table-cell">{format(new Date(slice.start), "h:mm a")} – {format(new Date(slice.end), "h:mm a")}</TableCell>
                      <TableCell className="hidden font-mono text-xs text-amber-700 sm:table-cell dark:text-amber-300">{formatDuration(slice.durationSeconds)}</TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{amount ? formatCurrency(amount, project?.currency) : "—"}</TableCell>
                      <TableCell><div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon-xs" data-testid="approve-draft" disabled={importing} aria-label="Approve" title="Approve" className="text-amber-700 hover:bg-amber-500/20 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200" onClick={() => void approveDraft(slice)}><Check className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon-xs" aria-label="Edit and approve" title="Edit and approve" onClick={() => openDraftEdit(slice)}><Pencil className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon-xs" data-testid="ignore-agent-slice" aria-label="Skip" title="Skip" onClick={() => ignoreAgentSlice(slice)}><Trash2 className="size-3.5" /></Button>
                      </div></TableCell>
                    </TableRow>
                  </Fragment>
                }
                const entry = row.entry
                const project = getProject(entry.projectId)
                const amount = entry.billable && project ? (entry.duration / 3600) * project.rate : 0
                return <Fragment key={entry.id}>
                  {dayHeader}
                  <TableRow id={`time-entry-${entry.id}`} tabIndex={-1} data-highlighted={highlightedEntry === entry.id || undefined} aria-label={entry.description || "Untitled time entry"} className={highlightedEntry === entry.id ? "bg-amber-500/15 outline-2 -outline-offset-2 outline-amber-500" : overlapIds.has(entry.id) ? "bg-red-500/5 hover:bg-red-500/10" : undefined}>
                  <TableCell className="font-medium whitespace-normal break-words">
                    <EntryChats description={entry.description} sources={sourcesForEntry(entry)} start={Date.parse(entry.startTime)} end={entry.endTime ? Date.parse(entry.endTime) : NaN} labels={data.settings.agentTimeHostLabels || {}} inferred={!entry.agentTimeSources?.length} />
                    <p className="mt-1 text-xs font-normal text-muted-foreground sm:hidden">{machineNames(sourcesForEntry(entry))}</p>
                    <p className="mt-1 text-xs font-normal text-muted-foreground sm:hidden">{entry.endTime ? `${format(new Date(entry.startTime), "h:mm a")} – ${format(new Date(entry.endTime), format(new Date(entry.startTime), "yyyy-MM-dd") === format(new Date(entry.endTime), "yyyy-MM-dd") ? "h:mm a" : "MMM d, h:mm a")}` : "No exact times"}</p>
                    {overlapIds.has(entry.id) && <button type="button" className="mt-1 block cursor-pointer text-xs text-red-700 underline underline-offset-4 dark:text-red-300" onClick={() => setReviewEntryOverlapsOpen(true)}>Review overlap</button>}
                    <p className="mt-0.5 whitespace-normal text-[0.7rem] font-normal text-muted-foreground sm:hidden"><span className="font-mono text-foreground">{formatDuration(entry.duration)}</span> · {project?.name ?? "—"} · {format(parseLocalDate(entry.date), "MMM d")}{amount ? ` · ${formatCurrency(amount, project?.currency)}` : ""}</p>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal text-xs sm:table-cell">{machineNames(sourcesForEntry(entry))}</TableCell>
                  <TableCell className="hidden whitespace-normal sm:table-cell">
                    <button className="inline-flex max-w-full items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => project && setProjectEdit({ id: project.id, name: project.name, rate: String(project.rate) })}>
                      <span>{project?.name ?? "—"}</span><Pencil className="size-3 shrink-0" />
                    </button>
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{format(parseLocalDate(entry.date), "MMM d, yyyy")}</TableCell>
                  <TableCell className="hidden font-mono text-xs whitespace-normal sm:table-cell">{entry.endTime ? `${format(new Date(entry.startTime), "h:mm a")} – ${format(new Date(entry.endTime), format(new Date(entry.startTime), "yyyy-MM-dd") === format(new Date(entry.endTime), "yyyy-MM-dd") ? "h:mm a" : "MMM d, h:mm a")}` : "No exact times"}</TableCell>
                  <TableCell className="hidden font-mono text-xs sm:table-cell">{formatDuration(entry.duration)}</TableCell>
                  <TableCell className="hidden font-mono text-xs sm:table-cell">{amount ? formatCurrency(amount, project?.currency) : "—"}</TableCell>
                  <TableCell><div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon-xs" onClick={() => handleResume(entry)}><Play className="size-3.5 fill-current" /></Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => openEdit(entry)}><Pencil className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(entry)}><Trash2 className="size-3.5" /></Button>
                  </div></TableCell>
                  </TableRow>
                </Fragment>
              })}
            </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <TrackerReviewDialog open={reviewEntryOverlapsOpen} onOpenChange={setReviewEntryOverlapsOpen} onCloseAutoFocus={(event) => {
        if (!jumpToEntry.current) return
        event.preventDefault()
        const id = jumpToEntry.current
        jumpToEntry.current = null
        window.requestAnimationFrame(() => {
          const row = document.getElementById(`time-entry-${id}`)
          row?.focus({ preventScroll: true })
          row?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" })
        })
      }} title="Saved conflicts" description="Keep the entry and dismiss its flag, or edit the times to resolve the overlap." emptyText="All saved-entry flags reviewed."
        actions={reviewedEntryOverlaps.length > 0 && <Button variant="ghost" size="sm" onClick={() => saveOverlapReviews("entry", [])}>Show dismissed flags</Button>}
        items={data.timeEntries.filter((entry) => overlapIds.has(entry.id)).map((entry) => {
          const project = getProject(entry.projectId)
          const client = getClient(project?.clientId ?? "")
          const timeLabel = `${format(new Date(entry.startTime), "MMM d, yyyy h:mm a")} – ${format(new Date(entry.endTime!), "MMM d, h:mm a")}`
          return { id: entry.id, searchText: `${entry.description} ${project?.name} ${client?.name} ${timeLabel}`, content: <div data-testid="saved-overlap-review-item">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-words font-medium">{entry.description || "Untitled"}</p>
              <Button type="button" variant="ghost" size="icon-sm" data-testid="find-conflict-in-log" aria-label="Find entry in time log" title="Find in time log" onClick={() => { jumpToEntry.current = entry.id; setHighlightedEntry(entry.id); setReviewEntryOverlapsOpen(false) }}><ArrowUpRight className="size-4" /></Button>
            </div>
            <p data-testid="overlap-minutes" className="mb-1 text-sm font-medium tabular-nums text-red-700 dark:text-red-300">{new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format((overlapDetails.get(entry.id)?.overlapMilliseconds ?? 0) / 60_000)} min overlapping</p>
            <p className="break-words text-xs text-muted-foreground">{client?.name} / {project?.name ?? "Unknown project"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{timeLabel}</p>
            <div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => { setReviewEntryOverlapsOpen(false); openEdit(entry) }}>Edit times</Button><Button type="button" variant="ghost" size="sm" data-testid="dismiss-saved-overlap" onClick={() => saveOverlapReviews("entry", [...reviewedEntryOverlaps, entryOverlapKeys.get(entry.id)!])}><X className="size-3" />Dismiss flag</Button></div>
          </div> }
        })}
      />
      <TrackerReviewDialog open={reviewAgentOverlapsOpen} onOpenChange={setReviewAgentOverlapsOpen} title="Excluded time" description="Already covered time is kept out of imports. Review these blocks at your own pace." emptyText="All excluded time reviewed."
        actions={<>{pendingAgentOverlaps.length > 0 && <Button variant="outline" size="sm" onClick={() => saveOverlapReviews("agent", [...new Set([...reviewedAgentOverlaps, ...pendingAgentOverlaps.map((item) => item.key)])])}>Dismiss all reviewed</Button>}{reviewedAgentOverlaps.length > 0 && <Button variant="ghost" size="sm" onClick={() => saveOverlapReviews("agent", [])}>Show dismissed blocks</Button>}</>}
        items={pendingAgentOverlaps.map((overlap) => {
          const project = getProject(overlap.projectId)
          const client = getClient(project?.clientId ?? "")
          const timeLabel = `${format(new Date(overlap.start), "MMM d, yyyy h:mm a")} – ${format(new Date(overlap.end), "MMM d, h:mm a")}`
          return { id: overlap.key, searchText: `${project?.name} ${client?.name} ${timeLabel}`, content: <div data-testid="agent-overlap-item" className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1"><p className="break-words font-medium">{project?.name ?? "Unknown project"}</p><p className="text-xs text-muted-foreground">{client?.name}</p><p className="mt-1 text-xs text-muted-foreground">{timeLabel}</p><p className="mt-1 text-xs tabular-nums">{formatDuration(Math.floor((overlap.end - overlap.start) / 1000))} excluded</p></div>
            <Button type="button" variant="ghost" size="icon-sm" data-testid="dismiss-agent-overlap-warning" aria-label="Dismiss reviewed agent overlap" onClick={() => saveOverlapReviews("agent", [...reviewedAgentOverlaps, overlap.key])}><X className="size-4" /></Button>
          </div> }
        })}
      />
      <TrackerReviewDialog open={projectsOpen} onOpenChange={setProjectsOpen} title="Import projects" description="Choose where each desktop project belongs. Personal projects stay out of imports." emptyText="No desktop projects to map."
        items={[...unmappedAgentProjects, ...handledAgentProjects].map((agentProject) => ({ id: agentProject, searchText: `${agentProject} ${getProject(projectMappings[agentProject])?.name ?? ""}`, content: <div data-testid="import-project-row" className="grid min-w-0 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="min-w-0"><p className="break-words text-sm font-medium">{agentProject}</p>{!projectMappings[agentProject] && <p className="text-xs text-muted-foreground">Choose a destination</p>}</div>
          <ImportProjectPicker value={projectMappings[agentProject] ?? ""} onChange={(value) => saveProjectMapping(agentProject, value)} choices={[{ value: PERSONAL_AGENT_PROJECT, label: "Personal — don't import" }, ...data.projects.map((project) => ({ value: project.id, label: `${getClient(project.clientId)?.name ?? ""} / ${project.name}` }))]} />
        </div> }))}
      />
      <Dialog open={importSettingsOpen} onOpenChange={setImportSettingsOpen}>
        <DialogContent><DialogHeader><DialogTitle>Import settings</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Adjust gap grouping and the period included in your review.</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <div className="flex h-8 items-center rounded-md border bg-background pl-3 focus-within:ring-2 focus-within:ring-ring" title="Join gaps up to this many minutes">
                <span>Gap</span>
                <Input id="tracker-agent-gap" data-testid="tracker-agent-gap" aria-label="Join gaps up to (minutes)" type="number" min="0" max="240" inputMode="numeric" value={gapMinutes} onChange={(event) => setGapMinutes(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyGapMinutes() }} className="h-7 w-12 border-0 bg-transparent px-1 text-center text-xs tabular-nums text-foreground shadow-none [appearance:textfield] focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none dark:bg-transparent" />
                <span className="pr-3">min</span>
              </div>
              <Button data-testid="apply-agent-gap" type="button" variant="outline" size="sm" className="h-8" onClick={applyGapMinutes} disabled={agentTimeLoading}>{agentTimeLoading && <LoaderCircle className="size-3.5 animate-spin" data-icon="inline-start" />}Refresh</Button>
              {!agentTimeStartDate || agentTimeStartDate <= HARD_AGENT_TIME_START_DATE
                ? <Button type="button" variant="ghost" size="sm" className="h-8" onClick={startWatchingAgentTimeToday}>Start fresh today</Button>
                : <Button type="button" variant="ghost" size="sm" className="h-8" onClick={showAllAgentTime}>Since {format(parseLocalDate(HARD_AGENT_TIME_START_DATE), "MMM d")}</Button>}
              {agentImportPreview.ignoredSeconds > 0 && <Button data-testid="restore-ignored-agent-slices" type="button" variant="ghost" size="sm" className="h-8" onClick={restoreVisibleIgnoredAgentRanges}>Restore skipped <span className="ml-1 font-mono">{formatDuration(agentImportPreview.ignoredSeconds)}</span></Button>}
            </div>
          <DialogFooter><Button variant="outline" onClick={() => setImportSettingsOpen(false)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addHoursOpen} onOpenChange={setAddHoursOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add hours</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <p className="text-sm text-muted-foreground">Add billable time without needing exact start and end times.</p>
            <div className="grid gap-2">
              <Label>Project</Label>
              <Select value={hoursForm.projectId} onValueChange={(projectId) => setHoursForm({ ...hoursForm, projectId })}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>{data.projects.filter((project) => project.status === "active").map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label htmlFor="hours-date">Date</Label><Input id="hours-date" type="date" value={hoursForm.date} onChange={(event) => setHoursForm({ ...hoursForm, date: event.target.value })} /></div>
              <div className="grid gap-2"><Label htmlFor="hours-count">Hours</Label><Input id="hours-count" type="number" min="0.01" step="0.25" placeholder="e.g. 2.5" value={hoursForm.hours} onChange={(event) => setHoursForm({ ...hoursForm, hours: event.target.value })} /></div>
            </div>
            <div className="grid gap-2"><Label htmlFor="hours-description">Description</Label><Input id="hours-description" placeholder="What did you work on?" value={hoursForm.description} onChange={(event) => setHoursForm({ ...hoursForm, description: event.target.value })} /></div>
            <div className="flex items-center gap-2"><Checkbox id="hours-billable" checked={hoursForm.billable} onCheckedChange={(value) => setHoursForm({ ...hoursForm, billable: value === true })} /><Label htmlFor="hours-billable">Billable</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddHoursOpen(false)}>Cancel</Button><Button onClick={saveHoursOnly}>Add hours</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!projectEdit} onOpenChange={(open) => !open && setProjectEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2"><Label>Project name</Label><Input value={projectEdit?.name ?? ""} onChange={(e) => setProjectEdit((p) => p ? { ...p, name: e.target.value } : p)} /></div>
            <div className="grid gap-2"><Label>Hourly rate</Label><Input type="number" min="0" step="0.01" value={projectEdit?.rate ?? ""} onChange={(e) => setProjectEdit((p) => p ? { ...p, rate: e.target.value } : p)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setProjectEdit(null)}>Cancel</Button><Button onClick={saveProjectEdit}>Save changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) { setEditEntry(null); setEditDraft(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editDraft ? "Approve draft" : "Edit Time Entry"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Project</Label>
              <Select
                value={editForm.projectId}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, projectId: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {data.projects.map((p) => {
                    const client = getClient(p.clientId)
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {client ? ` (${client.name})` : ""}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Input
                id="edit-desc"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                placeholder="What did you work on?"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Start Time</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="justify-start text-left font-normal"
                    >
                      <CalendarIcon className="size-4" data-icon="inline-start" />
                      {editForm.startTime
                        ? format(new Date(editForm.startTime), "MMM d, h:mm a")
                        : "Pick start"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editForm.startTime ? new Date(editForm.startTime) : undefined}
                      onSelect={(d) => {
                        if (!d) return
                        const prev = editForm.startTime ? new Date(editForm.startTime) : new Date()
                        d.setHours(prev.getHours(), prev.getMinutes())
                        setEditForm({ ...editForm, startTime: d.toISOString() })
                      }}
                      initialFocus
                    />
                    <div className="border-t px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={editForm.startTime ? format(new Date(editForm.startTime), "HH:mm") : ""}
                          onChange={(e) => {
                            const [h, m] = e.target.value.split(":").map(Number)
                            const d = editForm.startTime ? new Date(editForm.startTime) : new Date()
                            d.setHours(h, m)
                            setEditForm({ ...editForm, startTime: d.toISOString() })
                          }}
                          className="font-mono"
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-2">
                <Label>End Time</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="justify-start text-left font-normal"
                    >
                      <CalendarIcon className="size-4" data-icon="inline-start" />
                      {editForm.endTime
                        ? format(new Date(editForm.endTime), "MMM d, h:mm a")
                        : "Pick end"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={editForm.endTime ? new Date(editForm.endTime) : undefined}
                      onSelect={(d) => {
                        if (!d) return
                        const prev = editForm.endTime ? new Date(editForm.endTime) : new Date()
                        d.setHours(prev.getHours(), prev.getMinutes())
                        setEditForm({ ...editForm, endTime: d.toISOString() })
                      }}
                      initialFocus
                    />
                    <div className="border-t px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={editForm.endTime ? format(new Date(editForm.endTime), "HH:mm") : ""}
                          onChange={(e) => {
                            const [h, m] = e.target.value.split(":").map(Number)
                            const d = editForm.endTime ? new Date(editForm.endTime) : new Date()
                            d.setHours(h, m)
                            setEditForm({ ...editForm, endTime: d.toISOString() })
                          }}
                          className="font-mono"
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                Calculated duration:{" "}
              </span>
              <span className="font-mono text-sm font-medium">
                {editDuration > 0 ? formatDuration(editDuration) : "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Saving will move this entry to today&apos;s date.
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-billable"
                checked={editForm.billable}
                onCheckedChange={(v) =>
                  setEditForm({ ...editForm, billable: v === true })
                }
              />
              <Label htmlFor="edit-billable" className="text-sm">
                Billable
              </Label>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleEditSave}>{editDraft ? "Approve" : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete time entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;
              {deleteTarget?.description || "Untitled"}&rdquo; (
              {deleteTarget ? formatDuration(deleteTarget.duration) : ""}). This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
