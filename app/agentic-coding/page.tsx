"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import Link from "next/link"
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Download,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/page-header"
import type { AgentTimeBlock, AgentTimeImportData } from "@/lib/agent-time"
import { PERSONAL_AGENT_PROJECT, resolveAgentMappings } from "@/lib/agent-import-projects"
import { occupiedProjectRanges } from "@/lib/agent-time-overlap"
import {
  LEFT_OPEN_SECONDS,
  buildJournal,
  buildProjectLedger,
  summarizeUnbilledFolders,
  type Billing,
  type InsightTurn,
  type JournalDay,
  type ProjectLedger,
} from "@/lib/agentic-insights"
import { formatClock, formatCurrency } from "@/lib/format"
import { useStore } from "@/lib/store"
import type { Client, Project } from "@/lib/types"

const AGENT_TIME_START_DATE = "2026-08-30"
// The API clips turns at `from`, so ask from a day earlier: a turn that started before the first
// shown day keeps its full length and can still be recognized as left open.
const AGENT_TIME_FETCH_FROM = "2026-08-29"
const LOCAL_MAPPINGS_KEY = "timetracker-agent-time-project-mappings"
const THREADS_SHOWN = 6
const JOURNAL_ROWS_SHOWN = 7
const LEFT_OPEN_HOURS = LEFT_OPEN_SECONDS / 3600

// Hatching marks time inside turns left open: visible, but not working time.
const HATCH =
  "bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--muted-foreground)_55%,transparent)_0_2px,transparent_2px_6px)]"

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

/** `live` lists only the turns still running; `intervals` marks a whole merged block live if any turn in it is. */
type AgentTimeResponse = AgentTimeImportData & { live?: AgentTimeBlock[] }

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

function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      title="Running now"
      aria-label="Running now"
      className={`inline-block size-1.5 shrink-0 rounded-full bg-emerald-500 ring-3 ring-emerald-500/20 ${className}`}
    />
  )
}

function LedgerRow({
  row,
  project,
  client,
  scaleSeconds,
  folderTitle,
  open,
  onToggle,
}: {
  row: ProjectLedger
  project: Project | undefined
  client: Client | undefined
  scaleSeconds: number
  folderTitle: (folder: string) => string
  open: boolean
  onToggle: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const covered = Math.max(0, row.workingSeconds - row.untrackedSeconds)
  const pct = (seconds: number) => `${(seconds / scaleSeconds) * 100}%`
  const hasUntracked = row.untrackedSeconds >= 60
  const threads = showAll ? row.threads : row.threads.slice(0, THREADS_SHOWN)
  const folders = new Set(row.threads.map((thread) => thread.folder))
  return (
    <div className="border-b last:border-b-0" data-testid="agentic-ledger-row">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="grid w-full cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 text-left hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-4 md:grid-cols-[1rem_minmax(0,1.2fr)_minmax(0,2fr)_6rem_7rem_7rem]"
      >
        <ChevronRight aria-hidden className={`size-4 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
        <span className="min-w-0">
          <span className="block truncate font-medium">{client?.name ?? project?.name ?? "Project"}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {project ? `${project.name}, ${formatCurrency(project.rate, project.currency).replace(/\.00$/, "")}/h` : ""}
          </span>
        </span>
        <span className="col-span-2 col-start-2 row-start-2 min-w-0 md:col-span-1 md:col-start-auto md:row-start-auto">
          <span className="flex h-2.5 overflow-hidden rounded-sm bg-muted" aria-hidden>
            <span className="h-full bg-primary" style={{ width: pct(covered) }} />
            <span className="h-full bg-primary/35" style={{ width: pct(row.untrackedSeconds) }} />
            <span className={`h-full ${HATCH}`} style={{ width: pct(row.leftOpenSeconds) }} />
          </span>
          <span className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span><span className="font-medium text-foreground tabular-nums">{hours(row.workingSeconds)}</span> working</span>
            <span className="tabular-nums md:hidden">{hours(row.trackedSeconds)} tracked</span>
            {row.leftOpenTurns > 0 && (
              <span className="tabular-nums">+ {hours(row.leftOpenSeconds)} in {row.leftOpenTurns} {row.leftOpenTurns === 1 ? "turn" : "turns"} left open</span>
            )}
          </span>
        </span>
        <span className="hidden text-right text-sm tabular-nums md:block">{hours(row.trackedSeconds)}</span>
        <span className="hidden text-right tabular-nums md:block">
          {hasUntracked ? <span className="font-semibold">{hours(row.untrackedSeconds)}</span> : <span className="text-sm text-muted-foreground">All tracked</span>}
        </span>
        <span className="text-right tabular-nums">
          {hasUntracked && project ? (
            <span className="font-semibold">{formatCurrency((row.untrackedSeconds / 3600) * project.rate, project.currency)}</span>
          ) : (
            <span className="text-sm text-muted-foreground">{project ? formatCurrency(0, project.currency) : "—"}</span>
          )}
          <span className="block text-xs font-normal text-muted-foreground md:hidden">
            {hasUntracked ? `${hours(row.untrackedSeconds)} not tracked` : "All tracked"}
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t bg-muted/20 px-3 py-1.5 sm:px-4 md:pl-11" data-testid="agentic-ledger-threads">
          {threads.map((thread) => (
            <div key={thread.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-dashed py-2 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_12rem_5rem]">
              <span className="flex min-w-0 items-center gap-2">
                {thread.live && <LiveDot />}
                <span className="truncate" title={`${thread.title || "Untitled thread"}\nT3 thread ${thread.threadId}`}>
                  {thread.title || "Untitled thread"}
                </span>
                {folders.size > 1 && <span className="max-w-32 shrink-0 truncate rounded-md bg-muted px-1.5 py-px text-xs text-muted-foreground">{folderTitle(thread.folder)}</span>}
              </span>
              <span className="col-start-1 row-start-2 text-xs text-muted-foreground md:col-start-auto md:row-start-auto md:text-right">
                {thread.leftOpenTurns > 0 ? `+ ${hours(thread.leftOpenSeconds)} left open (${thread.leftOpenTurns})` : ""}
              </span>
              <span className="row-span-2 text-right tabular-nums md:row-span-1">{hours(thread.workingSeconds)}</span>
            </div>
          ))}
          {row.threads.length > THREADS_SHOWN && (
            <Button variant="ghost" size="xs" className="my-1 text-muted-foreground" onClick={() => setShowAll((value) => !value)}>
              {showAll ? "Show fewer" : `Show ${row.threads.length - THREADS_SHOWN} more threads`}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function JournalDayCard({
  day,
  open,
  onToggle,
  groupLabel,
  folderTag,
}: {
  day: JournalDay
  open: boolean
  onToggle: () => void
  groupLabel: (key: string) => string
  folderTag: (folder: string) => { label: string; billed: boolean }
}) {
  const [showAll, setShowAll] = useState(false)
  const dayEnd = new Date(day.dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const length = dayEnd.getTime() - day.dayStart
  const position = (start: number, end: number) => ({
    left: `${((start - day.dayStart) / length) * 100}%`,
    width: `${((end - start) / length) * 100}%`,
  })
  const visible = day.threads.filter((thread) => thread.workingSeconds >= 60)
  const threads = showAll ? visible : visible.slice(0, JOURNAL_ROWS_SHOWN)
  const groups = [...day.groups].filter(([, seconds]) => seconds >= 60).sort(([a], [b]) => (a === "unbilled" ? 1 : b === "unbilled" ? -1 : 0))
  const leftOpen = day.leftOpen
  const track = (children: React.ReactNode) => (
    <span className="relative block h-3.5 rounded-sm bg-muted" aria-hidden>
      {[25, 50, 75].map((left) => <span key={left} className="absolute inset-y-0 w-px bg-foreground/5" style={{ left: `${left}%` }} />)}
      {children}
    </span>
  )
  return (
    <div className="rounded-lg border bg-card" data-testid="agentic-day">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-left hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-4"
      >
        <ChevronRight aria-hidden className={`size-4 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
        <span className="font-medium">{format(new Date(day.dayStart), "EEE, MMM d")}</span>
        <span className="order-last flex basis-full flex-wrap gap-1.5 pl-7 sm:order-none sm:flex-1 sm:basis-auto sm:pl-0">
          {groups.map(([key, seconds]) => (
            <span key={key} className={`max-w-full truncate rounded-md px-1.5 py-px text-xs ${key === "unbilled" ? "bg-muted text-muted-foreground" : "bg-primary/15 text-foreground"}`}>
              {groupLabel(key)} <span className="tabular-nums">{hours(seconds)}</span>
            </span>
          ))}
        </span>
        <span className="ml-auto flex items-baseline gap-3">
          {leftOpen.turns > 0 && <span className="text-xs text-muted-foreground tabular-nums">+ {hours(leftOpen.seconds)} left open</span>}
          <span className="font-semibold tabular-nums">{hours(day.workingSeconds)}</span>
        </span>
      </button>
      {open && (
        <div className="border-t px-3 pt-1 pb-2.5 sm:px-4">
          <div className="grid grid-cols-1 gap-4 pt-1 text-[11px] text-muted-foreground sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_4rem]" aria-hidden>
            <span className="hidden sm:block" />
            <span className="flex justify-between"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span></span>
            <span className="hidden sm:block" />
          </div>
          {threads.map((thread) => {
            const tag = folderTag(thread.folder)
            return (
              <div key={thread.key} className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-x-4 gap-y-1 py-1.5 text-sm sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_4rem]">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate" title={`${thread.title || "Untitled thread"}\nT3 thread ${thread.threadId}`}>{thread.title || "Untitled thread"}</span>
                  <span className={`max-w-28 shrink-0 truncate rounded-md px-1.5 py-px text-xs sm:max-w-40 ${tag.billed ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground"}`}>{tag.label}</span>
                  {thread.live && <LiveDot />}
                </span>
                <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                  {track(thread.spans.map((span) => (
                    <span
                      key={span.start}
                      title={`${format(new Date(span.start), "h:mm a")} – ${format(new Date(span.end), "h:mm a")}`}
                      className={`absolute inset-y-0.5 min-w-0.5 rounded-[2px] ${tag.billed ? "bg-violet-500" : "bg-muted-foreground/60"}`}
                      style={position(span.start, span.end)}
                    />
                  )))}
                </span>
                <span className="text-right tabular-nums sm:row-start-auto">{hours(thread.workingSeconds)}</span>
              </div>
            )
          })}
          {leftOpen.turns > 0 && (
            <div className="mt-1 grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-x-4 gap-y-1 border-t border-dashed pt-2 text-sm sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_4rem]">
              <span className="text-amber-600 dark:text-amber-400">
                {leftOpen.turns} {leftOpen.turns === 1 ? "turn" : "turns"} left open
                {leftOpen.closedTogether ? `, ${leftOpen.closedTogether.turns} closed together ${format(new Date(leftOpen.closedTogether.end), "EEE h:mm a")}` : ""}
              </span>
              <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                {track(leftOpen.spans.map((span) => (
                  <span key={span.start} className="absolute inset-y-[3px] rounded-[2px] border border-amber-500/70" style={position(span.start, span.end)} />
                )))}
              </span>
              <span className="text-right text-muted-foreground tabular-nums">{hours(leftOpen.seconds)}</span>
            </div>
          )}
          {visible.length > JOURNAL_ROWS_SHOWN && (
            <Button variant="ghost" size="xs" className="mt-1 text-muted-foreground" onClick={() => setShowAll((value) => !value)}>
              {showAll ? "Show fewer" : `Show ${visible.length - JOURNAL_ROWS_SHOWN} shorter threads`}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export default function AgenticCodingPage() {
  const { data } = useStore()
  const [agentTime, setAgentTime] = useState<AgentTimeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [project, setProject] = useState("all")
  const [projectOpen, setProjectOpen] = useState(false)
  const [range, setRange] = useState("7d")
  const [search, setSearch] = useState("")
  const [openRows, setOpenRows] = useState<Set<string> | null>(null)
  const [openDays, setOpenDays] = useState<Set<number> | null>(null)
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
        `/api/agent-time?gapMinutes=0&includeLive=true&withLive=true&t3Only=true&from=${AGENT_TIME_FETCH_FROM}${fixture}`
      )
      if (!response.ok) throw new Error("Agent Time is not available")
      setAgentTime((await response.json()) as AgentTimeResponse)
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

  const liveThreads = useMemo(
    () => new Set((agentTime?.live ?? []).flatMap((block) =>
      (block.sourceIntervals ?? []).map((source) => `${source.hostUrl ?? ""}|${source.conversationId || block.id}|${Date.parse(source.start)}`))),
    [agentTime]
  )

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
            // Only the running turn itself is live, not the thread's earlier turns.
            live: liveThreads.has(`${threadKey}|${start}`),
          }]
        })
      ) ?? [],
    [agentTime, liveThreads]
  )

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
  const runningThreads = useMemo(() => new Set(turns.filter((turn) => turn.live).map((turn) => turn.threadKey)).size, [turns])
  const scaleSeconds = Math.max(1, ...ledger.map((row) => row.workingSeconds + row.leftOpenSeconds))

  const clientLabel = useCallback(
    (projectId: string) => {
      const p = projectsById.get(projectId)
      return (p && clientsById.get(p.clientId)?.name) || p?.name || "Project"
    },
    [projectsById, clientsById]
  )
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

  // Until someone toggles them, the top client and the two newest days start open.
  const rowsOpen = openRows ?? new Set(ledger.slice(0, 1).map((row) => row.projectId))
  const daysOpen = openDays ?? new Set(journal.slice(0, 2).map((day) => day.dayStart))
  const toggle = <T,>(current: Set<T>, value: T) => {
    const next = new Set(current)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }

  return (
    <>
      <PageHeader
        title="Agentic Coding"
        currencyToggle={false}
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

      <Card className="mb-6 rounded-lg">
        <CardContent className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-[180px_minmax(0,240px)_minmax(0,1fr)] lg:items-end">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="agent-range">Date range</Label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger id="agent-range" data-testid="agentic-range" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="all">All activity</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="agent-project">T3 project</Label>
            <Popover open={projectOpen} onOpenChange={setProjectOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="agent-project"
                  data-testid="agentic-project-picker"
                  variant="outline"
                  role="combobox"
                  aria-expanded={projectOpen}
                  className="w-full min-w-0 justify-between"
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
                      <CommandItem value="All projects" onSelect={() => { setProject("all"); setProjectOpen(false) }}>
                        <Check className={`mr-2 size-4 ${project === "all" ? "opacity-100" : "opacity-0"}`} />
                        All projects
                      </CommandItem>
                      {(agentTime?.projects ?? []).map((name) => (
                        <CommandItem key={name} value={`${folderTitle(name)} ${name}`} onSelect={() => { setProject(name); setProjectOpen(false) }}>
                          <Check className={`mr-2 size-4 ${project === name ? "opacity-100" : "opacity-0"}`} />
                          <span className="truncate">{folderTitle(name)}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid min-w-0 gap-2 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="agent-search">Search threads</Label>
            <Input
              id="agent-search"
              data-testid="agentic-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Thread title, thread ID, project…"
              className="min-w-0"
            />
          </div>
        </CardContent>
      </Card>

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
        <div className="grid min-w-0 gap-6">
          <div className="grid gap-3">
            {runningThreads > 0 && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="agentic-running">
                <LiveDot />
                {runningThreads} {runningThreads === 1 ? "thread" : "threads"} running now
              </p>
            )}
            {leftOpenTurns.length > 0 && (
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm" data-testid="agentic-left-open">
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="min-w-0 flex-1">
                  <span className="font-medium">
                    {leftOpenTurns.length} {leftOpenTurns.length === 1 ? "turn" : "turns"} stayed open over {LEFT_OPEN_HOURS} hours straight, {hours(leftOpenSeconds)} in all.
                  </span>{" "}
                  <span className="text-muted-foreground">They’re hatched below and not counted as working time. The import still offers them, so skip them there. Tracked and invoiced entries aren’t changed.</span>
                </p>
                <Button size="sm" variant="outline" onClick={() => setLeftOpenDialog(true)}>
                  Show turns
                </Button>
              </div>
            )}

            {ledger.length > 0 && (
              <div className="rounded-lg border bg-card" data-testid="agentic-ledger">
                <div className="hidden grid-cols-[1rem_minmax(0,1.2fr)_minmax(0,2fr)_6rem_7rem_7rem] gap-x-3 border-b px-4 py-2 text-xs text-muted-foreground md:grid">
                  <span />
                  <span>Client</span>
                  <span>Working time, {range === "all" ? "all activity" : RANGE_LABELS[range]}</span>
                  <span className="text-right">Tracked</span>
                  <span className="text-right">Not tracked yet</span>
                  <span className="text-right">At rate</span>
                </div>
                {ledger.map((row) => {
                  const p = projectsById.get(row.projectId)
                  return (
                    <LedgerRow
                      key={row.projectId}
                      row={row}
                      project={p}
                      client={p ? clientsById.get(p.clientId) : undefined}
                      scaleSeconds={scaleSeconds}
                      folderTitle={folderTitle}
                      open={rowsOpen.has(row.projectId)}
                      onToggle={() => setOpenRows(toggle(rowsOpen, row.projectId))}
                    />
                  )
                })}
              </div>
            )}

            {unbilled.length > 0 && (
              <div className="grid gap-2" data-testid="agentic-unbilled">
                <div className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
                  <span>Not billed</span>
                  <Link href="/tracker?importAgentTime=1" className="text-xs underline-offset-2 hover:text-foreground hover:underline">
                    Link folders to projects in the import
                  </Link>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {unbilled.map((folder) => (
                    <div key={folder.folder} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate" title={folder.folder}>{folderTitle(folder.folder)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {folder.billing.kind === "personal" ? "Personal" : "Not linked"}
                          {folder.leftOpenTurns > 0
                            ? `, + ${hours(folder.leftOpenSeconds)} left open`
                            : `, ${folder.threadCount} ${folder.threadCount === 1 ? "thread" : "threads"}`}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">{hours(folder.workingSeconds)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <section className="grid gap-2" aria-label="Work by day" data-testid="agentic-journal">
            <h2 className="text-sm text-muted-foreground">By day</h2>
            {journal.map((day) => (
              <JournalDayCard
                key={day.dayStart}
                day={day}
                open={daysOpen.has(day.dayStart)}
                onToggle={() => setOpenDays(toggle(daysOpen, day.dayStart))}
                groupLabel={groupLabel}
                folderTag={folderTag}
              />
            ))}
          </section>
        </div>
      )}

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
