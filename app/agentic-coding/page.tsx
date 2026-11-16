"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import Link from "next/link"
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Download,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Fact, FactBox } from "@/components/fact-list"
import { PageHeader } from "@/components/page-header"
import { HeaderSearch } from "@/components/header-search"
import { SheetAction, SheetSection } from "@/components/more-sheet"
import type { AgentTimeImportData } from "@/lib/agent-time"
import { PERSONAL_AGENT_PROJECT, resolveAgentMappings } from "@/lib/agent-import-projects"
import { occupiedProjectRanges } from "@/lib/agent-time-overlap"
import { conversationKey } from "@/lib/agent-time-chats"
import { normalizeBillFactor } from "@/lib/billing"
import {
  LEFT_OPEN_SECONDS,
  buildJournal,
  buildProjectLedger,
  summarizeUnbilledFolders,
  type Billing,
  type InsightTurn,
  type JournalDay,
  type JournalThread,
  type ProjectLedger,
} from "@/lib/agentic-insights"
import { formatClock, formatCurrency } from "@/lib/format"
import { useStore } from "@/lib/store"
import type { Project } from "@/lib/types"

const AGENT_TIME_START_DATE = "2026-08-30"
// The API clips turns at `from`, so ask from a day earlier: a turn that started before the first
// shown day keeps its full length and can still be recognized as left open.
const AGENT_TIME_FETCH_FROM = "2026-08-29"
const LOCAL_MAPPINGS_KEY = "timetracker-agent-time-project-mappings"
const THREADS_SHOWN = 6
const JOURNAL_ROWS_SHOWN = 7
const LEFT_OPEN_HOURS = LEFT_OPEN_SECONDS / 3600
// Clients take these in ledger order; time not billed to anyone stays gray.
const CLIENT_COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-2)"]
const UNBILLED_COLOR = "var(--chart-5)"
const DAY_MS = 24 * 60 * 60 * 1000
const LIVE_REFRESH_MS = 60_000

const RANGE_LABELS: Record<string, string> = {
  today: "today",
  "7d": "the last 7 days",
  "30d": "the last 30 days",
  all: "any date",
}

function mobileFixtureRequested() {
  return (
    typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" &&
    new URLSearchParams(window.location.search).get("fixture") === "mobile"
  )
}

const hours = (seconds: number) => `${formatClock(seconds)} h`

type ThreadInfo = { startedAt: number; link?: string }

/** T3 Code's own share link; it opens the thread on whichever machine runs it. */
const t3ThreadLink = (environmentId: string, threadId: string) =>
  `https://app.t3.codes/threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(threadId)}`

function OpenInT3({ link, className = "" }: { link: string | undefined; className?: string }) {
  if (!link) return <span aria-hidden className={`size-8 shrink-0 ${className}`} />
  return (
    <a
      href={link}
      target="_blank"
      rel="noreferrer"
      aria-label="Open in T3 Code"
      title="Open in T3 Code"
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${className}`}
    >
      <ExternalLink aria-hidden className="size-3.5" />
    </a>
  )
}

const startedLabel = (time: number) =>
  Number.isFinite(time) ? format(new Date(time), new Date(time).toDateString() === new Date().toDateString() ? "h:mm a" : "EEE, MMM d, h:mm a") : "Unknown"


type ViewState = "loading" | "unavailable" | "empty" | "filtered" | "ready"

function AgenticEmptyState({
  state,
  range,
  filtersActive,
  onClearFilters,
  onShowAllDates,
  onRetry,
}: {
  state: Exclude<ViewState, "ready">
  range: string
  filtersActive: boolean
  onClearFilters: () => void
  onShowAllDates: () => void
  onRetry: () => void
}) {
  if (state === "loading") {
    return (
      <div role="status" aria-busy="true" aria-label="Loading agentic coding" className="grid gap-4" data-testid="agentic-loading">
        {[0, 1].map((index) => (
          <div key={index} className="grid gap-2 rounded-lg border p-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
        <span className="sr-only">Loading agentic coding…</span>
      </div>
    )
  }
  let title: string
  let detail: string
  let action: React.ReactNode = null
  if (state === "unavailable") {
    title = "Activity unavailable"
    detail = "Agent Time didn’t respond, so this isn’t the same as no coding time."
    action = (
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw data-icon="inline-start" />
        Retry
      </Button>
    )
  } else if (state === "empty") {
    title = "No T3 Code activity recorded yet"
    detail = "Activity appears here once an Agent Time collector reports it."
    action = (
      <Button size="sm" variant="outline" asChild>
        <Link href="/settings">Check Agent Time settings</Link>
      </Button>
    )
  } else if (filtersActive) {
    title = "No threads match these filters"
    detail = "Try a different project or search."
    action = (
      <Button size="sm" variant="outline" onClick={onClearFilters} data-testid="agentic-clear-filters">
        Clear filters
      </Button>
    )
  } else {
    title = `No T3 Code activity in ${RANGE_LABELS[range] ?? "this range"}`
    detail = "Earlier activity is still available."
    action =
      range !== "all" ? (
        <Button size="sm" variant="outline" onClick={onShowAllDates}>
          Show all activity
        </Button>
      ) : null
  }
  return (
    <div className="grid justify-items-center gap-1 rounded-lg border border-dashed px-4 py-10 text-center" data-testid={`agentic-${state}`}>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{detail}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

type ChartDay = { dayStart: number; day: JournalDay | undefined }

/** One bar per day in the range, split by billing group, newest on the right. Click a bar to pick that day. */
function DayChart({
  days,
  selected,
  onSelect,
  groupOrder,
  colorFor,
}: {
  days: ChartDay[]
  selected: number | null
  onSelect: (dayStart: number) => void
  groupOrder: string[]
  colorFor: (key: string) => string
}) {
  const max = Math.max(1, ...days.map(({ day }) => day?.workingSeconds ?? 0))
  // Past two weeks the bars get narrow: drop the figures above them, label Mondays only,
  // and scroll sideways if needed, starting at the newest day.
  const dense = days.length > 14
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth
  }, [days.length])
  return (
    <div ref={scroller} className="overflow-x-auto">
      <div
        className={`flex items-end px-2 pt-3 sm:px-3 ${dense ? "gap-0.5" : "gap-1 sm:gap-2"}`}
        style={dense ? { minWidth: `${days.length * 1.5}rem` } : undefined}
      >
        {days.map(({ dayStart, day }) => {
          const seconds = day?.workingSeconds ?? 0
          const groups = groupOrder.filter((key) => (day?.groups.get(key) ?? 0) > 0)
          const isSelected = dayStart === selected
          const date = new Date(dayStart)
          return (
            <button
              key={dayStart}
              type="button"
              disabled={!day}
              aria-pressed={isSelected}
              aria-label={`${format(date, "EEEE, MMM d")}: ${seconds >= 60 ? hours(seconds) : "no activity"}`}
              title={`${format(date, "EEE, MMM d")}: ${hours(seconds)}`}
              onClick={() => onSelect(dayStart)}
              className={`flex min-w-0 flex-1 cursor-pointer flex-col gap-1.5 rounded-md px-1 pt-1 pb-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default ${
                isSelected ? "bg-primary/10" : "enabled:hover:bg-muted/60"
              }`}
              data-testid="agentic-chart-day"
            >
              {!dense && (
                <span className="text-center text-[11px] text-muted-foreground tabular-nums sm:text-xs">
                  {seconds >= 60 ? formatClock(seconds) : "\u00a0"}
                </span>
              )}
              <span className="flex h-28 flex-col justify-end sm:h-32" aria-hidden>
                <span
                  className="flex flex-col-reverse overflow-hidden rounded-sm"
                  style={{ height: `${(seconds / max) * 100}%`, minHeight: seconds > 0 ? 3 : 0 }}
                >
                  {groups.map((key) => (
                    <span key={key} className="basis-0" style={{ flexGrow: day?.groups.get(key) ?? 0, background: colorFor(key) }} />
                  ))}
                </span>
              </span>
              <span
                className={`text-center text-[11px] whitespace-nowrap sm:text-xs ${dense ? "-mx-4 h-4" : "truncate"} ${isSelected ? "text-foreground sm:font-medium" : "text-muted-foreground"}`}
              >
                {dense ? (date.getDay() === 1 ? format(date, "MMM d") : "") : format(date, "EEE d")}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A thread on the picked day. Click it to see when it ran. */
function DayThread({
  thread,
  dayStart,
  tag,
  info,
  folderTitle,
}: {
  thread: JournalThread
  dayStart: number
  tag: { label: string; billed: boolean }
  info: ThreadInfo
  folderTitle: (folder: string) => string
}) {
  const [open, setOpen] = useState(false)
  const first = thread.spans[0]
  const last = thread.spans[thread.spans.length - 1]
  return (
    <div className="border-b border-dashed last:border-b-0">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ChevronRight aria-hidden className={`size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
          <span className="min-w-0 flex-1 truncate">{thread.title || "Untitled thread"}</span>
          <span className={`max-w-28 shrink-0 truncate rounded-md px-1.5 py-px text-xs sm:max-w-40 ${tag.billed ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground"}`}>
            {tag.label}
          </span>
          <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums max-sm:hidden">
            {format(new Date(first.start), "h:mm a")}
            {thread.live ? " – now" : ""}
          </span>
          <span className="w-14 shrink-0 text-right tabular-nums">{hours(thread.workingSeconds)}</span>
        </button>
        <OpenInT3 link={info.link} />
      </div>
      {open && (
        <dl className="mb-2 ml-5.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Chat started</dt>
          <dd className="tabular-nums">{startedLabel(info.startedAt)}</dd>
          {thread.live && (
            <>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium">Running now</dd>
            </>
          )}
          <dt className="text-muted-foreground">Ran</dt>
          <dd className="grid gap-1.5 tabular-nums">
            <span>
              {format(new Date(first.start), "h:mm a")} – {format(new Date(last.end), "h:mm a")}
              {thread.spans.length > 1 && <span className="text-muted-foreground">, in {thread.spans.length} stretches</span>}
            </span>
            <span className="relative block h-2.5 max-w-80 rounded-sm bg-muted" aria-hidden>
              {thread.spans.map((span) => (
                <span
                  key={span.start}
                  className={`absolute inset-y-0 min-w-0.5 rounded-[2px] ${tag.billed ? "bg-primary" : "bg-muted-foreground/60"}`}
                  style={{ left: `${((span.start - dayStart) / DAY_MS) * 100}%`, width: `${((span.end - span.start) / DAY_MS) * 100}%` }}
                />
              ))}
            </span>
            <span className="flex max-w-80 justify-between text-[10px] text-muted-foreground" aria-hidden>
              <span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span>
            </span>
          </dd>
          <dt className="text-muted-foreground">Folder</dt>
          <dd className="truncate">{folderTitle(thread.folder)}</dd>
          <dt className="text-muted-foreground">T3 thread</dt>
          <dd className="truncate font-mono text-muted-foreground">{thread.threadId}</dd>
          {info.link && (
            <dd className="col-start-2 pt-1">
              <Button asChild size="xs" variant="outline">
                <a href={info.link} target="_blank" rel="noreferrer">
                  <ExternalLink data-icon="inline-start" />
                  Open in T3 Code
                </a>
              </Button>
            </dd>
          )}
        </dl>
      )}
    </div>
  )
}

function DayDetail({
  day,
  folderTag,
  folderTitle,
  infoFor,
}: {
  day: JournalDay
  folderTag: (folder: string) => { label: string; billed: boolean }
  folderTitle: (folder: string) => string
  infoFor: (key: string) => ThreadInfo
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = day.threads.filter((thread) => thread.workingSeconds >= 60)
  const threads = showAll ? visible : visible.slice(0, JOURNAL_ROWS_SHOWN)
  return (
    <section className="rounded-lg border bg-card px-3 py-3 sm:px-4" aria-label={format(new Date(day.dayStart), "EEEE, MMM d")} data-testid="agentic-day">
      <div className="mb-1 flex items-baseline gap-2.5">
        <h2 className="font-semibold">{format(new Date(day.dayStart), "EEE, MMM d")}</h2>
        <span className="flex-1 text-sm text-muted-foreground">
          {visible.length} {visible.length === 1 ? "thread" : "threads"}
        </span>
        <span className="font-semibold tabular-nums">{hours(day.workingSeconds)}</span>
      </div>
      {threads.map((thread) => (
        <DayThread key={thread.key} thread={thread} dayStart={day.dayStart} tag={folderTag(thread.folder)} info={infoFor(thread.key)} folderTitle={folderTitle} />
      ))}
      {day.leftOpen.turns > 0 && (
        <p className="mt-1 flex justify-between gap-3 border-t border-dashed pt-2 text-sm text-warning-foreground">
          <span>
            {day.leftOpen.turns} {day.leftOpen.turns === 1 ? "turn" : "turns"} left open, not counted
          </span>
          <span className="tabular-nums">{hours(day.leftOpen.seconds)}</span>
        </p>
      )}
      {visible.length > JOURNAL_ROWS_SHOWN && (
        <Button variant="ghost" size="xs" className="mt-1 text-muted-foreground" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Show fewer" : `Show ${visible.length - JOURNAL_ROWS_SHOWN} shorter threads`}
        </Button>
      )}
    </section>
  )
}

/** The legend's client, opened: its numbers and threads for the range. */
function ClientDetail({
  row,
  project,
  folderTitle,
  infoFor,
}: {
  row: ProjectLedger
  project: Project | undefined
  folderTitle: (folder: string) => string
  infoFor: (key: string) => ThreadInfo
}) {
  const [showAll, setShowAll] = useState(false)
  const threads = showAll ? row.threads : row.threads.slice(0, THREADS_SHOWN)
  const folders = new Set(row.threads.map((thread) => thread.folder))
  const hasUntracked = row.untrackedSeconds >= 60
  return (
    <div className="grid gap-4">
      <FactBox>
        <Fact label="Working time" value={hours(row.workingSeconds)} />
        <Fact label="Tracked" value={hours(row.trackedSeconds)} />
        <Fact label="Not tracked yet" value={hasUntracked ? hours(row.untrackedSeconds) : "All tracked"} />
        {project && (
          <Fact
            label={`At ${formatCurrency(project.rate, project.currency).replace(/\.00$/, "")}/h`}
            value={formatCurrency(hasUntracked ? (row.billableUntrackedSeconds / 3600) * project.rate : 0, project.currency)}
          />
        )}
        {row.leftOpenTurns > 0 && (
          <Fact
            label="Left open, not counted"
            value={`${hours(row.leftOpenSeconds)} in ${row.leftOpenTurns} ${row.leftOpenTurns === 1 ? "turn" : "turns"}`}
            tone="warning"
          />
        )}
      </FactBox>
      <div>
        <h3 className="mb-1 text-sm text-muted-foreground">Threads</h3>
        {threads.map((thread) => (
          <div key={thread.key} className="flex items-center gap-2 border-b border-dashed py-1 text-sm last:border-b-0">
            <span className="min-w-0 flex-1 truncate" title={`${thread.title || "Untitled thread"}\nT3 thread ${thread.threadId}`}>
              {thread.title || "Untitled thread"}
            </span>
            {folders.size > 1 && <span className="max-w-32 shrink-0 truncate rounded-md bg-muted px-1.5 py-px text-xs text-muted-foreground">{folderTitle(thread.folder)}</span>}
            <span className="shrink-0 tabular-nums">{hours(thread.workingSeconds)}</span>
            <OpenInT3 link={infoFor(thread.key).link} />
          </div>
        ))}
        {row.threads.length > THREADS_SHOWN && (
          <Button variant="ghost" size="xs" className="mt-1 text-muted-foreground" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Show fewer" : `Show ${row.threads.length - THREADS_SHOWN} more threads`}
          </Button>
        )}
      </div>
    </div>
  )
}

export default function AgenticCodingPage() {
  const { data } = useStore()
  const [agentTime, setAgentTime] = useState<AgentTimeImportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [project, setProject] = useState("all")
  const [projectOpen, setProjectOpen] = useState(false)
  // The phone copy of the picker lives in the More sheet, so it keeps its own open state.
  const [phoneProjectOpen, setPhoneProjectOpen] = useState(false)
  const [range, setRange] = useState("7d")
  const [search, setSearch] = useState("")
  const [pickedDay, setPickedDay] = useState<number | null>(null)
  // A legend entry opened in the dialog: "project:<id>" or "unbilled".
  const [groupDetail, setGroupDetail] = useState<string | null>(null)
  const [runningOpen, setRunningOpen] = useState(false)
  const [leftOpenDialog, setLeftOpenDialog] = useState(false)
  // Choices made in this browser in the import flow; "Personal" lives only here.
  const [localMappings] = useState<Record<string, string>>(() => {
    if (mobileFixtureRequested()) return { "Fixture Project": "fixture-project" }
    try {
      const saved = typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_MAPPINGS_KEY) : null
      const parsed: unknown = saved ? JSON.parse(saved) : {}
      return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {}
    } catch {
      return {}
    }
  })

  const loadAgentTime = useCallback(async (showToast = false) => {
    setLoading(true)
    try {
      const fixture = mobileFixtureRequested() ? "&fixture=mobile" : ""
      const response = await fetch(
        `/api/agent-time?gapMinutes=0&includeLive=true&t3Only=true&from=${AGENT_TIME_FETCH_FROM}${fixture}`
      )
      if (!response.ok) throw new Error("Agent Time is not available")
      setAgentTime((await response.json()) as AgentTimeImportData)
      setLoadError(null)
      if (showToast) toast.success("Agentic coding activity refreshed")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load Agent Time"
      // The inline notice stays until a load succeeds; the toast only answers a manual refresh.
      setLoadError(message)
      if (showToast) toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => void loadAgentTime(), 0)
    return () => window.clearTimeout(id)
  }, [loadAgentTime])
  // Keep "Running now" current while the page is open; skip hidden tabs.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadAgentTime()
    }, LIVE_REFRESH_MS)
    return () => window.clearInterval(id)
  }, [loadAgentTime])

  // Counted from when Agent Time was last read, so a tab left open rolls over at the next refresh.
  const fetchedAt = agentTime?.fetchedAt
  const rangeStart = useMemo(() => {
    if (range === "all") return new Date(`${AGENT_TIME_START_DATE}T00:00:00`).getTime()
    const start = fetchedAt ? new Date(fetchedAt) : new Date(0)
    start.setHours(0, 0, 0, 0)
    if (range === "7d") start.setDate(start.getDate() - 6)
    if (range === "30d") start.setDate(start.getDate() - 29)
    return start.getTime()
  }, [range, fetchedAt])

  const savedChatFactors = data.settings.agentTimeChatBillFactors
  const chatFactors = useMemo(() => savedChatFactors || {}, [savedChatFactors])

  // Each T3 Code turn, clipped to the range. Fixture data mixes in other sources, which are never billed.
  const allTurns = useMemo<InsightTurn[]>(
    () =>
      agentTime?.intervals.flatMap((block) =>
        (block.sourceIntervals ?? []).flatMap((source) => {
          if (!source.source.toLowerCase().includes("t3")) return []
          const start = Date.parse(source.start)
          const end = Date.parse(source.end)
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return []
          const threadId = source.conversationId || block.id
          const threadKey = `${source.hostUrl ?? ""}|${threadId}`
          return [{
            folder: block.project,
            threadKey,
            title: (source.conversationSummary || source.conversationTitle || "").trim(),
            threadId,
            start,
            end,
            leftOpen: (end - start) / 1000 > LEFT_OPEN_SECONDS,
            // Older collectors don't mark single turns, so fall back to the merged block.
            live: source.live ?? block.live,
            billFactor: normalizeBillFactor(chatFactors[conversationKey(source)] ?? 1),
          }]
        })
      ) ?? [],
    [agentTime, chatFactors]
  )

  // Where each thread lives in T3 Code, and when it first ran, keyed like the turns.
  const threadInfo = useMemo(() => {
    const info = new Map<string, ThreadInfo>()
    for (const block of agentTime?.intervals ?? []) {
      for (const source of block.sourceIntervals ?? []) {
        const threadId = source.conversationId || block.id
        const key = `${source.hostUrl ?? ""}|${threadId}`
        const start = Date.parse(source.start)
        const current = info.get(key)
        info.set(key, {
          startedAt: Math.min(current?.startedAt ?? Infinity, Number.isFinite(start) ? start : Infinity),
          link: current?.link ?? (source.t3EnvironmentId && source.conversationId ? t3ThreadLink(source.t3EnvironmentId, source.conversationId) : undefined),
        })
      }
    }
    return info
  }, [agentTime])
  const infoFor = useCallback((key: string): ThreadInfo => threadInfo.get(key) ?? { startedAt: Infinity }, [threadInfo])

  const turns = useMemo(() => {
    const query = search.trim().toLowerCase()
    return allTurns.flatMap((turn) => {
      if (turn.end <= rangeStart) return []
      if (project !== "all" && turn.folder !== project) return []
      if (query && !`${turn.folder} ${turn.title} ${turn.threadId}`.toLowerCase().includes(query)) return []
      return [{ ...turn, start: Math.max(turn.start, rangeStart) }]
    })
  }, [allTurns, project, rangeStart, search])

  const folderTitles = useMemo(
    () => new Map((agentTime?.t3Projects ?? []).map((t3) => [t3.name, t3.title || t3.name])),
    [agentTime]
  )
  const folderTitle = useCallback((folder: string) => folderTitles.get(folder) ?? folder, [folderTitles])

  const mappings = useMemo(
    () => resolveAgentMappings([...(agentTime?.projects ?? []), ...allTurns.map((turn) => turn.folder)], data.projects, localMappings),
    [agentTime, allTurns, data.projects, localMappings]
  )
  const projectsById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects])
  const clientsById = useMemo(() => new Map(data.clients.map((c) => [c.id, c])), [data.clients])
  const billingFor = useCallback(
    (folder: string): Billing => {
      const target = mappings[folder]
      if (target === PERSONAL_AGENT_PROJECT) return { kind: "personal" }
      if (target && projectsById.has(target)) return { kind: "project", projectId: target }
      return { kind: "none" }
    },
    [mappings, projectsById]
  )

  const ledger = useMemo(
    () =>
      buildProjectLedger(
        turns,
        billingFor,
        (projectId) => occupiedProjectRanges(projectId, data.timeEntries, data.activeTimers)
      ),
    [turns, billingFor, data.timeEntries, data.activeTimers]
  )
  const unbilled = useMemo(() => summarizeUnbilledFolders(turns, billingFor), [turns, billingFor])
  const journal = useMemo(() => buildJournal(turns, billingFor), [turns, billingFor])
  const leftOpenTurns = useMemo(() => turns.filter((turn) => turn.leftOpen).sort((a, b) => b.start - a.start), [turns])
  // The sum of what the ledger rows and folder cards show, so the banner matches them.
  const leftOpenSeconds =
    ledger.reduce((total, row) => total + row.leftOpenSeconds, 0) +
    unbilled.reduce((total, folder) => total + folder.leftOpenSeconds, 0)
  // Threads with a turn running right now, newest turn first.
  const running = useMemo(() => {
    const byThread = new Map<string, InsightTurn>()
    for (const turn of turns) {
      if (!turn.live) continue
      const current = byThread.get(turn.threadKey)
      if (!current || turn.start < current.start) byThread.set(turn.threadKey, turn)
    }
    return [...byThread.values()].sort((a, b) => b.start - a.start)
  }, [turns])
  const workingSeconds = journal.reduce((total, day) => total + day.workingSeconds, 0)
  const unbilledSeconds = unbilled.reduce((total, folder) => total + folder.workingSeconds, 0)
  // What hasn't been tracked yet, priced at each project's rate and summed per currency.
  const untracked = useMemo(() => {
    let seconds = 0
    const amounts = new Map<Project["currency"], number>()
    for (const row of ledger) {
      if (row.untrackedSeconds < 60) continue
      seconds += row.untrackedSeconds
      const p = projectsById.get(row.projectId)
      if (p) amounts.set(p.currency, (amounts.get(p.currency) ?? 0) + (row.billableUntrackedSeconds / 3600) * p.rate)
    }
    return { seconds, money: [...amounts].map(([currency, amount]) => formatCurrency(amount, currency)).join(" + ") }
  }, [ledger, projectsById])

  const clientLabel = useCallback(
    (projectId: string) => {
      const p = projectsById.get(projectId)
      return (p && clientsById.get(p.clientId)?.name) || p?.name || "Project"
    },
    [projectsById, clientsById]
  )
  // Ordered by client name so a client keeps its color when the range or filters change.
  const groupOrder = useMemo(
    () => [
      ...ledger
        .map((row) => row.projectId)
        .sort((a, b) => clientLabel(a).localeCompare(clientLabel(b)) || a.localeCompare(b))
        .map((projectId) => `project:${projectId}`),
      "unbilled",
    ],
    [ledger, clientLabel]
  )
  const colorFor = useCallback(
    (key: string) => (key === "unbilled" ? UNBILLED_COLOR : CLIENT_COLORS[groupOrder.indexOf(key) % CLIENT_COLORS.length]),
    [groupOrder]
  )
  // Every day in the range gets a bar, including days without activity.
  const chartDays = useMemo<ChartDay[]>(() => {
    const byDay = new Map(journal.map((day) => [day.dayStart, day]))
    const last = fetchedAt ? new Date(fetchedAt) : new Date()
    last.setHours(0, 0, 0, 0)
    const days: ChartDay[] = []
    for (const cursor = new Date(rangeStart); cursor.getTime() <= last.getTime(); cursor.setDate(cursor.getDate() + 1)) {
      days.push({ dayStart: cursor.getTime(), day: byDay.get(cursor.getTime()) })
    }
    // Long ranges start at the first day with activity rather than a run of empty bars.
    const first = days.length > 14 ? days.findIndex(({ day }) => day) : 0
    return first > 0 ? days.slice(first) : days
  }, [journal, rangeStart, fetchedAt])
  // The picked day while it's still in view, otherwise the newest day with activity.
  const selectedDay = journal.find((day) => day.dayStart === pickedDay) ?? journal[0]

  const groupLabel = useCallback(
    (key: string) => (key === "unbilled" ? "Not billed" : clientLabel(key.slice("project:".length))),
    [clientLabel]
  )
  const folderTag = useCallback(
    (folder: string) => {
      const billing = billingFor(folder)
      return billing.kind === "project"
        ? { label: clientLabel(billing.projectId), billed: true }
        : { label: folderTitle(folder), billed: false }
    },
    [billingFor, clientLabel, folderTitle]
  )

  const filtersActive = project !== "all" || search.trim() !== ""
  const viewState: ViewState = !agentTime
    ? loadError
      ? "unavailable"
      : "loading"
    : turns.length > 0
      ? "ready"
      : allTurns.length === 0
        ? "empty"
        : "filtered"

  const detailRow = ledger.find((row) => `project:${row.projectId}` === groupDetail)
  const detailProject = detailRow ? projectsById.get(detailRow.projectId) : undefined
  const rangeLabel = range === "all" ? "all activity" : RANGE_LABELS[range]

  // The range and project filters render in the desktop toolbar and, on phones, in the More sheet.
  const rangeSelect = (id: string, testId: string) => (
    <Select value={range} onValueChange={setRange}>
      <SelectTrigger id={id} data-testid={testId} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="today">Today</SelectItem>
        <SelectItem value="7d">Last 7 days</SelectItem>
        <SelectItem value="30d">Last 30 days</SelectItem>
        <SelectItem value="all">All activity</SelectItem>
      </SelectContent>
    </Select>
  )
  const projectPicker = (id: string, testId: string, open: boolean, setOpen: (open: boolean) => void) => (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          data-testid={testId}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full min-w-0 justify-between max-sm:text-[16px]"
        >
          <span className="truncate">{project === "all" ? "All projects" : folderTitle(project)}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-1">
        <Command>
          <CommandInput placeholder="Search T3 projects…" />
          <CommandList>
            <CommandEmpty>No project found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="All projects" onSelect={() => { setProject("all"); setOpen(false) }}>
                <Check className={`mr-2 size-4 ${project === "all" ? "opacity-100" : "opacity-0"}`} />
                All projects
              </CommandItem>
              {(agentTime?.projects ?? []).map((name) => (
                <CommandItem key={name} value={`${folderTitle(name)} ${name}`} onSelect={() => { setProject(name); setOpen(false) }}>
                  <Check className={`mr-2 size-4 ${project === name ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{folderTitle(name)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
  const filtersChanged = (range !== "7d" ? 1 : 0) + (project !== "all" ? 1 : 0)

  return (
    <>
      <PageHeader
        title="Agentic Coding"
        currencyToggle={false}
        center={<HeaderSearch value={search} onChange={setSearch} noun="threads" testId="agentic-search-phone" />}
        primary={{ label: "Review & import time", icon: Download, href: "/tracker?importAgentTime=1", testId: "agentic-import-time" }}
        moreCount={filtersChanged}
        onMoreClear={filtersChanged ? () => { setRange("7d"); setProject("all") } : undefined}
        more={<>
          <SheetSection label="Date range">{rangeSelect("agent-range-phone", "agentic-range-phone")}</SheetSection>
          <SheetSection label="T3 project">{projectPicker("agent-project-phone", "agentic-project-picker-phone", phoneProjectOpen, setPhoneProjectOpen)}</SheetSection>
          <SheetAction icon={RefreshCw} label={loading ? "Refreshing…" : "Refresh"} disabled={loading} onSelect={() => void loadAgentTime(true)} />
        </>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link data-testid="agentic-import-time" href="/tracker?importAgentTime=1">
                <Download className="size-3.5" data-icon="inline-start" />
                Review &amp; import time
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void loadAgentTime(true)} disabled={loading}>
              {loading ? (
                <LoaderCircle className="size-3.5 animate-spin" data-icon="inline-start" />
              ) : (
                <RefreshCw className="size-3.5" data-icon="inline-start" />
              )}
              Refresh
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex min-w-0 items-center gap-2 max-sm:hidden">
        <div className="w-40 shrink-0">{rangeSelect("agent-range", "agentic-range")}</div>
        <div className="w-52 min-w-0 shrink">{projectPicker("agent-project", "agentic-project-picker", projectOpen, setProjectOpen)}</div>
        <Input
          id="agent-search"
          aria-label="Search threads"
          data-testid="agentic-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search threads"
          className="min-w-0 max-w-72 flex-1"
        />
      </div>

      {loadError && (
        <div
          role="alert"
          data-testid="agentic-load-error"
          className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm"
        >
          <AlertTriangle aria-hidden className="size-4 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1">
            <span className="font-medium">{agentTime ? "Couldn’t refresh Agent Time." : "Agent Time is unavailable."}</span>{" "}
            <span className="text-muted-foreground">
              {agentTime
                ? `Showing activity from ${agentTime.fetchedAt ? format(new Date(agentTime.fetchedAt), "h:mm a") : "the last successful load"}, which may be out of date.`
                : "Totals are unknown until it reconnects, not zero. Check that the Agent Time service is running."}
            </span>
          </p>
          <Button size="sm" variant="outline" onClick={() => void loadAgentTime(true)} disabled={loading} data-testid="agentic-retry">
            <RefreshCw className={loading ? "animate-spin" : undefined} data-icon="inline-start" />
            Retry
          </Button>
        </div>
      )}

      {viewState !== "ready" ? (
        <AgenticEmptyState
          state={viewState}
          range={range}
          filtersActive={filtersActive}
          onClearFilters={() => { setProject("all"); setSearch("") }}
          onShowAllDates={() => setRange("all")}
          onRetry={() => void loadAgentTime(true)}
        />
      ) : (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          {leftOpenTurns.length > 0 && (
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm" data-testid="agentic-left-open">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="min-w-0 flex-1">
                <span className="font-medium">
                  {leftOpenTurns.length} {leftOpenTurns.length === 1 ? "turn" : "turns"} stayed open over {LEFT_OPEN_HOURS} hours straight, {hours(leftOpenSeconds)} in all.
                </span>{" "}
                <span className="text-muted-foreground">They aren’t counted as working time. The import still offers them, so skip them there. Tracked and invoiced entries aren’t changed.</span>
              </p>
              <Button size="sm" variant="outline" onClick={() => setLeftOpenDialog(true)}>
                Show turns
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-x-8 gap-y-2" data-testid="agentic-summary">
            <div>
              <p className="text-xs text-muted-foreground">Not tracked yet</p>
              <p className="text-2xl font-semibold tabular-nums">
                {untracked.seconds < 60 ? (
                  "All tracked"
                ) : untracked.money ? (
                  <>
                    {untracked.money} <span className="text-sm font-normal text-muted-foreground">· {hours(untracked.seconds)}</span>
                  </>
                ) : (
                  hours(untracked.seconds)
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Agent time, {rangeLabel}</p>
              <p className="text-base leading-8 tabular-nums">{hours(workingSeconds)}</p>
            </div>
            <button
              type="button"
              disabled={running.length === 0}
              onClick={() => setRunningOpen(true)}
              className="-mx-2 cursor-pointer rounded-md px-2 text-left enabled:hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default"
              data-testid="agentic-running"
            >
              <span className="block text-xs text-muted-foreground">Running now</span>
              <span className="flex items-center gap-1 text-base leading-8 tabular-nums">
                {running.length === 0 ? "Nothing" : `${running.length} ${running.length === 1 ? "thread" : "threads"}`}
                {running.length > 0 && <ChevronRight aria-hidden className="size-4 text-muted-foreground" />}
              </span>
            </button>
          </div>

          <div className="min-w-0 rounded-lg border bg-card" data-testid="agentic-chart">
            <DayChart
              days={chartDays}
              selected={selectedDay?.dayStart ?? null}
              onSelect={setPickedDay}
              groupOrder={groupOrder}
              colorFor={colorFor}
            />
            <div className="flex flex-wrap gap-1 border-t px-1.5 py-1.5 sm:px-2.5">
              {[
                ...ledger.map((row) => {
                  const p = projectsById.get(row.projectId)
                  const owed = row.untrackedSeconds >= 60 && p ? formatCurrency((row.billableUntrackedSeconds / 3600) * p.rate, p.currency) : null
                  return { key: `project:${row.projectId}`, label: clientLabel(row.projectId), note: owed ? `${owed} not tracked` : "all tracked" }
                }),
                ...(unbilled.length > 0 ? [{ key: "unbilled", label: "Not billed", note: hours(unbilledSeconds) }] : []),
              ].map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setGroupDetail(entry.key)}
                  className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:min-h-11"
                  data-testid="agentic-legend"
                >
                  <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: colorFor(entry.key) }} />
                  <span className="font-medium">{entry.label}</span>
                  <span className="text-muted-foreground tabular-nums">{entry.note}</span>
                </button>
              ))}
            </div>
          </div>

          {selectedDay && <DayDetail key={selectedDay.dayStart} day={selectedDay} folderTag={folderTag} folderTitle={folderTitle} infoFor={infoFor} />}
        </div>
      )}

      <Dialog open={runningOpen && running.length > 0} onOpenChange={setRunningOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Running now</DialogTitle>
            <DialogDescription>Threads with a turn in progress, newest first. Updates every minute.</DialogDescription>
          </DialogHeader>
          <div>
            {running.map((turn) => {
              const tag = folderTag(turn.folder)
              const info = infoFor(turn.threadKey)
              return (
                <div key={turn.threadKey} className="flex items-center gap-2 border-b border-dashed py-1.5 text-sm last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{turn.title || "Untitled thread"}</span>
                    <span className="block truncate text-xs text-muted-foreground tabular-nums">
                      Active since {format(new Date(turn.start), "h:mm a")}
                      {Number.isFinite(info.startedAt) ? `, chat started ${startedLabel(info.startedAt)}` : ""}
                    </span>
                  </span>
                  <span className={`max-w-28 shrink-0 truncate rounded-md px-1.5 py-px text-xs ${tag.billed ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground"}`}>
                    {tag.label}
                  </span>
                  <OpenInT3 link={info.link} />
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={groupDetail !== null} onOpenChange={(open) => !open && setGroupDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{groupDetail ? groupLabel(groupDetail) : ""}</DialogTitle>
            <DialogDescription>
              {detailRow
                ? `${detailProject ? `${detailProject.name}, ` : ""}${rangeLabel}`
                : `Folders not linked to a client project, ${rangeLabel}. They aren’t in any client’s totals.`}
            </DialogDescription>
          </DialogHeader>
          {detailRow ? (
            <ClientDetail key={detailRow.projectId} row={detailRow} project={detailProject} folderTitle={folderTitle} infoFor={infoFor} />
          ) : groupDetail === "unbilled" ? (
            <div>
              {unbilled.map((folder) => (
                <div key={folder.folder} className="flex items-center gap-3 border-b border-dashed py-2 text-sm last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" title={folder.folder}>{folderTitle(folder.folder)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {folder.billing.kind === "personal" ? "Personal" : "Not linked"}, {folder.threadCount} {folder.threadCount === 1 ? "thread" : "threads"}
                      {folder.leftOpenTurns > 0 ? `, + ${hours(folder.leftOpenSeconds)} left open` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{hours(folder.workingSeconds)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <Button asChild size="sm" variant={groupDetail === "unbilled" ? "outline" : "default"} className="justify-self-start">
            <Link href="/tracker?importAgentTime=1">
              <Download data-icon="inline-start" />
              {groupDetail === "unbilled" ? "Link folders to projects in the import" : "Review & import time"}
            </Link>
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={leftOpenDialog} onOpenChange={setLeftOpenDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Turns left open</DialogTitle>
            <DialogDescription>
              Turns that ran over {LEFT_OPEN_HOURS} hours straight. They aren’t counted as working time here. Nothing already tracked or invoiced changes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid">
            {leftOpenTurns.map((turn, index) => {
              const tag = folderTag(turn.folder)
              return (
                <div key={`${turn.threadKey}:${turn.start}:${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-dashed py-2 text-sm last:border-b-0">
                  <span className="min-w-0">
                    <span className="block truncate" title={`T3 thread ${turn.threadId}`}>{turn.title || "Untitled thread"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {tag.label}, {format(new Date(turn.start), "EEE MMM d, h:mm a")} to {format(new Date(turn.end), "EEE h:mm a")}
                    </span>
                  </span>
                  <span className="tabular-nums">{hours((turn.end - turn.start) / 1000)}</span>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
