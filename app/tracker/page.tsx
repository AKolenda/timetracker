"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import {
  Play,
  Pause,
  Square,
  Trash2,
  Pencil,
  Clock,
  CalendarIcon,
  Download,
  Plus,
  LoaderCircle,
  TriangleAlert,
  ChevronsUpDown,
  ChevronDown,
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
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { PageHeader } from "@/components/page-header"
import { useStore } from "@/lib/store"
import { formatCurrency, formatDuration, formatHours } from "@/lib/format"
import { localDateString, parseLocalDate } from "@/lib/datetime"
import { subtractRanges, type TimeRange } from "@/lib/agent-time-overlap"
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
  slices: AgentImportSlice[]
  skippedSeconds: number
  unmappedProjects: string[]
  unmappedSeconds: number
  unmappedBlocks: number
}
const PERSONAL_AGENT_PROJECT = "__personal__"
const HARD_AGENT_TIME_START_DATE = "2026-08-30"
const DAILY_AGENT_GAP_KEY = "timetracker-agent-time-gap-today"
const AGENT_REMINDER_DISMISSED_KEY = "timetracker-agent-time-dismissed-through"

function sourceDescription(interval: AgentTimeSourceInterval) {
  if (interval.source === "T3 Code") return `T3 Code using ${interval.agent}`
  return `${interval.source || interval.agent} directly`
}

function groupConversationSources(
  intervals: AgentTimeSourceInterval[],
  sliceStart: number,
  sliceEnd: number
) {
  const conversations = new Map<string, AgentTimeSourceInterval & { spans: TimeRange[] }>()
  for (const interval of intervals) {
    const start = Math.max(new Date(interval.start).getTime(), sliceStart)
    const end = Math.min(new Date(interval.end).getTime(), sliceEnd)
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue
    const key = `${interval.source}:${interval.conversationId || interval.conversationTitle || interval.model || interval.agent}`
    const current = conversations.get(key)
    if (current) current.spans.push({ start, end })
    else conversations.set(key, { ...interval, spans: [{ start, end }] })
  }

  return [...conversations.values()].map((conversation) => {
    const spans = [...conversation.spans].sort((a, b) => a.start - b.start)
    const merged: TimeRange[] = []
    for (const span of spans) {
      const previous = merged.at(-1)
      if (previous && span.start <= previous.end) previous.end = Math.max(previous.end, span.end)
      else merged.push({ ...span })
    }
    return {
      ...conversation,
      spans: merged,
      durationSeconds: merged.reduce((total, span) => total + Math.floor((span.end - span.start) / 1000), 0),
    }
  }).sort((a, b) => a.spans[0].start - b.spans[0].start)
}

function unionRangeSeconds(ranges: TimeRange[]) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const merged: TimeRange[] = []
  for (const range of sorted) {
    const previous = merged.at(-1)
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end)
    else merged.push({ ...range })
  }
  return merged.reduce((total, range) => total + Math.floor((range.end - range.start) / 1000), 0)
}

type ConversationSource = ReturnType<typeof groupConversationSources>[number]

function SourceLogo({ source, agent, className = "size-6" }: { source: string; agent: string; className?: string }) {
  if (source === "T3 Code") {
    return <span className={`grid shrink-0 place-items-center rounded-md bg-gradient-to-br from-indigo-400 via-violet-600 to-indigo-950 text-[0.55rem] font-black tracking-tighter text-white shadow-sm ${className}`} aria-label="T3 Code logo">T3</span>
  }
  if (source === "Claude" || agent === "Claude" || agent === "Fable") {
    return <span className={`grid shrink-0 place-items-center rounded-md bg-[#d97757] text-white shadow-sm ${className}`} aria-label="Claude logo"><svg viewBox="0 0 24 24" className="size-[72%]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M18.7 5.3 5.3 18.7M8.2 3.4l7.6 17.2M20.6 8.2 3.4 15.8M15.8 3.4 8.2 20.6M3.4 8.2l17.2 7.6" /></svg></span>
  }
  return <span className={`grid shrink-0 place-items-center rounded-md bg-emerald-600 text-white shadow-sm ${className}`} aria-label="ChatGPT logo"><svg viewBox="0 0 24 24" className="size-[76%]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M11.217 19.384A3.501 3.501 0 0 0 18 18.167V13l-6-3.35" /><path d="M5.214 15.014A3.501 3.501 0 0 0 9.66 20.28L14 17.746V10.8" /><path d="M6 7.63c-1.391-.236-2.787.395-3.534 1.689a3.474 3.474 0 0 0 1.271 4.745L8 16.578l6-3.348" /><path d="M12.783 4.616A3.501 3.501 0 0 0 6 5.833V10.9l6 3.45" /><path d="M18.786 8.986A3.501 3.501 0 0 0 14.34 3.72L10 6.254V13.2" /><path d="M18 16.302c1.391.236 2.787-.395 3.534-1.689a3.474 3.474 0 0 0-1.271-4.745l-4.308-2.514L10 10.774" /></svg></span>
}

function timelineSourceKey(source: ConversationSource) {
  if (source.source === "T3 Code") return "t3"
  if (source.source === "Claude" || source.agent === "Claude" || source.agent === "Fable") return "claude"
  return "codex"
}

function TimelinePreview({ sources, start, end }: { sources: ConversationSource[]; start: number; end: number }) {
  const duration = Math.max(1, end - start)
  const sourceMeta = {
    claude: { label: "Claude", bar: "bg-[#d97757]" },
    codex: { label: "Codex / ChatGPT", bar: "bg-emerald-500" },
    t3: { label: "T3 Code", bar: "bg-violet-500" },
  } as const
  const lanes = (["claude", "codex", "t3"] as const).map((key) => ({
    key,
    ...sourceMeta[key],
    conversations: sources.filter((source) => timelineSourceKey(source) === key),
  })).filter((lane) => lane.conversations.length > 0)
  const activeRanges = sources.flatMap((source) => source.spans)
  const gaps = subtractRanges({ start, end }, activeRanges)

  return <div className="mb-3 min-w-0 rounded-lg border bg-background/35 p-3" data-testid="agent-timeline-preview">
    <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
      <div><p className="text-xs font-medium">Timeline preview</p><p className="text-[0.7rem] text-muted-foreground">Activity lanes and the gaps included in this billable block</p></div>
      <p className="font-mono text-[0.7rem] text-muted-foreground">{formatDuration(Math.floor(duration / 1000))}</p>
    </div>
    <div className="grid min-w-0 gap-2">
      {lanes.map((lane) => <div key={lane.key} className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2">
        <SourceLogo source={lane.key === "t3" ? "T3 Code" : lane.key === "claude" ? "Claude" : "Codex"} agent={lane.key === "claude" ? "Claude" : "Codex"} className="size-7" />
        <div className="relative h-7 min-w-0 overflow-hidden rounded-md border bg-muted/25" aria-label={`${lane.label} activity lane`}>
          {lane.conversations.flatMap((conversation) => conversation.spans.map((span, spanIndex) => {
            const left = ((span.start - start) / duration) * 100
            const width = ((span.end - span.start) / duration) * 100
            return <span key={`${conversation.conversationId}-${span.start}-${spanIndex}`} className={`absolute inset-y-1 min-w-px cursor-help rounded-[4px] ${lane.bar}`} style={{ left: `${left}%`, width: `${width}%` }} title={`${conversation.conversationTitle || lane.label} · ${format(new Date(span.start), "h:mm:ss a")}–${format(new Date(span.end), "h:mm:ss a")} · ${formatDuration(Math.floor((span.end - span.start) / 1000))}`} />
          }))}
        </div>
      </div>)}
      {gaps.length > 0 && <div className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-muted/30 text-[0.55rem] font-bold text-muted-foreground" aria-label="Joined gap">GAP</span>
        <div className="relative h-7 min-w-0 overflow-hidden rounded-md border bg-muted/15" aria-label="Joined gap filler lane">
          {gaps.map((gap, gapIndex) => <span key={`${gap.start}-${gap.end}-${gapIndex}`} className="absolute inset-y-1 min-w-px cursor-help rounded-[4px] border border-muted-foreground/35" style={{ left: `${((gap.start - start) / duration) * 100}%`, width: `${((gap.end - gap.start) / duration) * 100}%`, backgroundImage: "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in oklab, var(--muted-foreground) 28%, transparent) 4px 6px)" }} title={`Joined gap · ${format(new Date(gap.start), "h:mm:ss a")}–${format(new Date(gap.end), "h:mm:ss a")} · ${formatDuration(Math.floor((gap.end - gap.start) / 1000))}`} />)}
        </div>
      </div>}
    </div>
    <div className="mt-2 flex min-w-0 justify-between pl-9 font-mono text-[0.65rem] text-muted-foreground"><span>{format(new Date(start), "h:mm a")}</span><span>{format(new Date(end), "h:mm a")}</span></div>
    <div className="mt-3 flex min-w-0 flex-wrap gap-x-3 gap-y-2 border-t pt-3 text-[0.7rem] text-muted-foreground">
      {lanes.map((lane) => <span key={lane.key} className="inline-flex items-center gap-1.5"><SourceLogo source={lane.key === "t3" ? "T3 Code" : lane.key === "claude" ? "Claude" : "Codex"} agent={lane.key === "claude" ? "Claude" : "Codex"} className="size-4" />{lane.label}</span>)}
      {gaps.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="size-4 rounded-[4px] border border-muted-foreground/35" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 3px, color-mix(in oklab, var(--muted-foreground) 30%, transparent) 3px 5px)" }} />Gap filler</span>}
    </div>
  </div>
}

function mobileFixtureRequested() {
  return typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" &&
    new URLSearchParams(window.location.search).get("fixture") === "mobile"
}

function savedDailyAgentGap(today: string) {
  if (mobileFixtureRequested() || typeof window === "undefined") return "15"
  try {
    const saved = JSON.parse(localStorage.getItem(DAILY_AGENT_GAP_KEY) ?? "null") as { date?: string; minutes?: number } | null
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

function savedAgentReminderDismissal() {
  if (mobileFixtureRequested() || typeof window === "undefined") return 0
  try {
    const dismissedThrough = Number(localStorage.getItem(AGENT_REMINDER_DISMISSED_KEY) ?? 0)
    return Number.isFinite(dismissedThrough) ? dismissedThrough : 0
  } catch {
    return 0
  }
}

function buildAgentImportPlan(
  intervals: AgentTimeInterval[],
  projectMappings: Record<string, string>,
  timeEntries: TimeEntry[],
  cutoff: number | null
): AgentImportPlan {
  const occupiedByProject = new Map<string, TimeRange[]>()
  for (const entry of timeEntries) {
    if (!entry.startTime || !entry.endTime) continue
    const start = new Date(entry.startTime).getTime()
    const end = new Date(entry.endTime).getTime()
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue
    const occupied = occupiedByProject.get(entry.projectId) ?? []
    occupied.push({ start, end })
    occupiedByProject.set(entry.projectId, occupied)
  }

  const slices: AgentImportSlice[] = []
  const unmappedProjects = new Set<string>()
  let skippedSeconds = 0
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
    const gaps = subtractRanges({ start: sourceStart, end: sourceEnd }, occupied)
    const uncoveredSeconds = gaps.reduce(
      (total, gap) => total + Math.floor((gap.end - gap.start) / 1000),
      0
    )
    skippedSeconds += Math.floor((sourceEnd - sourceStart) / 1000) - uncoveredSeconds

    for (const gap of gaps) {
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
    skippedSeconds,
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
    <span data-testid="today-total" className="font-mono text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
      {formatDuration(completedSeconds + activeSeconds)}
    </span>
  )
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
  const [importOpen, setImportOpen] = useState(false)
  const [agentTime, setAgentTime] = useState<AgentTimeResponse | null>(null)
  const [agentTimeLoading, setAgentTimeLoading] = useState(false)
  const [expandedAgentSlice, setExpandedAgentSlice] = useState<string | null>(null)
  const [gapMinutes, setGapMinutes] = useState("15")
  const [appliedGapMinutes, setAppliedGapMinutes] = useState("15")
  const [dismissedAgentTimeThrough, setDismissedAgentTimeThrough] = useState(0)
  const [agentProjectFilter, setAgentProjectFilter] = useState("all")
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
    const savedDismissal = savedAgentReminderDismissal()
    const id = window.setTimeout(() => {
      setGapMinutes(savedGap)
      setAppliedGapMinutes(savedGap)
      setDismissedAgentTimeThrough(savedDismissal)
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

  const selectedAgentIntervals = useMemo(
    () => availableAgentIntervals.filter(
      (interval) => agentProjectFilter === "all" || interval.project === agentProjectFilter
    ),
    [agentProjectFilter, availableAgentIntervals]
  )

  const agentImportPreview = useMemo(
    () => buildAgentImportPlan(
      selectedAgentIntervals,
      projectMappings,
      data.timeEntries,
      agentTimeCutoff
    ),
    [agentTimeCutoff, data.timeEntries, projectMappings, selectedAgentIntervals]
  )

  const agentImportPreviewSeconds = agentImportPreview.slices.reduce(
    (total, slice) => total + slice.durationSeconds,
    0
  )
  const selectedPersonalIntervals = selectedAgentIntervals.filter(
    (interval) => projectMappings[interval.project] === PERSONAL_AGENT_PROJECT
  ).length

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
      setAgentProjectFilter("all")
      setExpandedAgentSlice(null)
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
      localStorage.setItem(DAILY_AGENT_GAP_KEY, JSON.stringify({
        date: todayEntryDate,
        minutes: Number(normalizedGap),
      }))
    } catch {
      // The current page still uses the choice when browser storage is unavailable.
    }
    toast.success(`Agent Time gap set to ${normalizedGap} ${normalizedGap === "1" ? "minute" : "minutes"} for today`)
    void loadAgentTime(false, normalizedGap)
  }

  function openAgentTimeImport() {
    setImportOpen(true)
    if (!agentTime) void loadAgentTime()
  }

  async function importAgentTime() {
    if (!agentTime) return
    const plan = buildAgentImportPlan(
      selectedAgentIntervals,
      projectMappings,
      data.timeEntries,
      agentTimeCutoff
    )
    if (plan.unmappedProjects.length) {
      toast.error(`Choose a TimeTracker project for ${plan.unmappedProjects.join(", ")}`)
      return
    }

    let imported = 0
    for (const slice of plan.slices) {
      const gapStart = new Date(slice.start)
      const gapEnd = new Date(slice.end)
      await addTimeEntry({
        projectId: slice.projectId,
        description: `Agent Time — ${slice.interval.agents.join(" + ") || "coding"}`,
        startTime: gapStart.toISOString(),
        endTime: gapEnd.toISOString(),
        duration: slice.durationSeconds,
        billable: true,
        date: localDateString(gapStart, data.settings.timezone),
      })
      imported++
    }
    toast.success(imported ? `Imported ${imported} uncovered ${imported === 1 ? "entry" : "entries"}` : "Everything was already tracked")
    if (plan.skippedSeconds > 0) toast(`Skipped ${formatDuration(plan.skippedSeconds)} already tracked`)
    dismissAgentTimeNotification()
    setImportOpen(false)
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

  function openEdit(entry: TimeEntry) {
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
    if (!editEntry) return
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
    const dateStr = localDateString(new Date(), data.settings.timezone)

    await updateTimeEntry(editEntry.id, {
      description: editForm.description,
      projectId: editForm.projectId,
      startTime: startDt.toISOString(),
      endTime: endDt.toISOString(),
      duration: editDuration,
      billable: editForm.billable,
      date: dateStr,
    })
    toast.success("Entry updated")
    setEditOpen(false)
    setEditEntry(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    await deleteTimeEntry(deleteTarget.id)
    toast.success("Entry deleted")
    setDeleteTarget(null)
  }

  const sortedEntries = useMemo(
    () => [...data.timeEntries].sort((a, b) =>
      `${b.date}${b.startTime ?? ""}`.localeCompare(`${a.date}${a.startTime ?? ""}`)
    ),
    [data.timeEntries]
  )
  const todayCompletedSeconds = useMemo(
    () => data.timeEntries
      .filter((entry) => entry.date === todayEntryDate)
      .reduce((total, entry) => total + entry.duration, 0),
    [data.timeEntries, todayEntryDate]
  )

  const unimportedAgentTime = useMemo(() => {
    if (!agentTime) return { seconds: 0, blocks: 0, unmappedProjects: [] as string[], latestEnd: 0 }
    const plan = buildAgentImportPlan(
      agentTime.intervals,
      projectMappings,
      data.timeEntries,
      agentTimeCutoff
    )
    const unmappedProjects = new Set(plan.unmappedProjects)
    const latestMappedSliceEnd = plan.slices.reduce(
      (latest, slice) => Math.max(latest, slice.end),
      0
    )
    const latestUnmappedEnd = agentTime.intervals.reduce((latest, interval) => {
      if (!unmappedProjects.has(interval.project)) return latest
      const end = new Date(interval.end).getTime()
      return Number.isFinite(end) ? Math.max(latest, end) : latest
    }, 0)
    return {
      seconds: plan.slices.reduce((total, slice) => total + slice.durationSeconds, 0) + plan.unmappedSeconds,
      blocks: plan.slices.length + plan.unmappedBlocks,
      unmappedProjects: plan.unmappedProjects,
      latestEnd: Math.max(latestMappedSliceEnd, latestUnmappedEnd),
    }
  }, [agentTime, agentTimeCutoff, data.timeEntries, projectMappings])

  function dismissAgentTimeNotification() {
    if (!unimportedAgentTime.latestEnd) return
    setDismissedAgentTimeThrough(unimportedAgentTime.latestEnd)
    try {
      localStorage.setItem(AGENT_REMINDER_DISMISSED_KEY, String(unimportedAgentTime.latestEnd))
    } catch {
      // Dismissal still applies until this page is refreshed.
    }
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

      <Card className="mb-6 rounded-lg">
        <CardContent className="grid min-w-0 gap-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/35">
              <Clock className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Today&apos;s total</p>
              <TodayTotal completedSeconds={todayCompletedSeconds} activeTimers={activeTimers} />
              <p className="text-xs text-muted-foreground">Completed entries and active timers</p>
            </div>
          </div>
          <div className="grid min-w-0 gap-1.5 sm:justify-items-end">
            <Label htmlFor="tracker-agent-gap" className="text-xs text-muted-foreground">Agent Time gap</Label>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Input
                id="tracker-agent-gap"
                data-testid="tracker-agent-gap"
                type="number"
                min="0"
                max="240"
                inputMode="numeric"
                value={gapMinutes}
                onChange={(event) => setGapMinutes(event.target.value)}
                className="h-9 w-20"
              />
              <span className="text-xs text-muted-foreground">minutes</span>
              <Button
                data-testid="apply-agent-gap"
                type="button"
                variant="outline"
                size="sm"
                onClick={applyGapMinutes}
                disabled={agentTimeLoading}
              >
                {agentTimeLoading && <LoaderCircle className="size-3.5 animate-spin" data-icon="inline-start" />}
                Apply
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">For today only · resets to 15 tomorrow</p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="pt-5">
          {data.projects.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Create a client and project first to start tracking time
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_260px_auto_auto] sm:items-center">
                <Input
                  data-testid="timer-description"
                  placeholder="What are you working on?"
                  value={timerDesc}
                  onChange={(e) => setTimerDesc(e.target.value)}
                  className="h-10 min-w-0 w-full"
                />
                <Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button data-testid="timer-project-picker" variant="outline" role="combobox" aria-expanded={projectPickerOpen} className="h-10 w-full justify-between" >
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

      {unimportedAgentTime.seconds > 0 && unimportedAgentTime.latestEnd > dismissedAgentTimeThrough && (
        <Card data-testid="agent-time-reminder" className="mb-6 border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-medium">{formatDuration(unimportedAgentTime.seconds)} of Agent Time has not been imported</p>
                <p className="text-sm text-muted-foreground">
                  {unimportedAgentTime.blocks} {unimportedAgentTime.blocks === 1 ? "block is" : "blocks are"} not covered by an existing timed entry.
                  {unimportedAgentTime.unmappedProjects.length > 0 && ` Map ${unimportedAgentTime.unmappedProjects.slice(0, 3).join(", ")}${unimportedAgentTime.unmappedProjects.length > 3 ? ` and ${unimportedAgentTime.unmappedProjects.length - 3} more` : ""} to client projects before importing.`}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                data-testid="dismiss-agent-time-reminder"
                variant="ghost"
                onClick={() => {
                  dismissAgentTimeNotification()
                  toast("Agent Time reminder dismissed until there is new activity")
                }}
              >
                <X className="size-3.5" data-icon="inline-start" />
                Dismiss
              </Button>
              {!agentTimeStartDate || agentTimeStartDate <= HARD_AGENT_TIME_START_DATE ? (
                <Button variant="outline" onClick={startWatchingAgentTimeToday}>Start fresh today</Button>
              ) : (
                <Button variant="ghost" onClick={showAllAgentTime}>Show from Aug 30</Button>
              )}
              <Button variant="outline" onClick={openAgentTimeImport}>
                <Download className="size-3.5" data-icon="inline-start" />
                Review and import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-medium">Time Log</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddHoursOpen(true)}>
              <Plus className="size-3.5" data-icon="inline-start" />
              Add hours
            </Button>
            <Button variant="outline" size="sm" onClick={openAgentTimeImport}>
              <Download className="size-3.5" data-icon="inline-start" />
              Import Agent Time
            </Button>
          </div>
        </CardHeader>
        {sortedEntries.length === 0 ? (
          <CardContent>
            <p className="py-8 text-center text-sm text-muted-foreground">
              No time entries yet
            </p>
          </CardContent>
        ) : (
          <CardContent className="pb-4">
            <div className="overflow-x-auto rounded-xl border">
              <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedEntries.map((entry, index) => {
                const project = getProject(entry.projectId)
                const amount = entry.billable && project ? (entry.duration / 3600) * project.rate : 0
                const isNewDay = index === 0 || entry.date !== sortedEntries[index - 1]?.date
                const dayLabel = entry.date === todayEntryDate ? "Today" : format(parseLocalDate(entry.date), "EEEE, MMMM d, yyyy")
                return <Fragment key={entry.id}>
                  {isNewDay && <TableRow className="bg-muted/35 hover:bg-muted/35"><TableCell colSpan={6} className="py-2 text-xs font-semibold text-muted-foreground">{dayLabel}</TableCell></TableRow>}
                  <TableRow>
                  <TableCell className="font-medium">{entry.description || "Untitled"}</TableCell>
                  <TableCell>
                    <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => project && setProjectEdit({ id: project.id, name: project.name, rate: String(project.rate) })}>
                      {project?.name ?? "—"}<Pencil className="size-3" />
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{format(parseLocalDate(entry.date), "MMM d, yyyy")}</TableCell>
                  <TableCell className="font-mono text-xs">{formatDuration(entry.duration)}</TableCell>
                  <TableCell className="font-mono text-xs">{amount ? formatCurrency(amount, project?.currency) : "—"}</TableCell>
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
          </CardContent>
        )}
      </Card>

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

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent
          data-testid="agent-import-dialog"
          className="max-h-[calc(100dvh-2rem)] min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>Import Agent Time</DialogTitle>
          </DialogHeader>
          <div className="grid min-w-0 gap-4 py-3">
            <p className="text-sm text-muted-foreground">Agent Time stays running in the background. Map its project names once, then import only time that does not overlap existing timed entries.</p>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground"><span className="min-w-0 break-words">Showing Agent Time from {format(parseLocalDate(effectiveAgentTimeStartDate), "MMM d, yyyy")} onward.</span>{agentTimeStartDate && agentTimeStartDate > HARD_AGENT_TIME_START_DATE && <Button variant="ghost" size="sm" onClick={showAllAgentTime}>Show from Aug 30</Button>}</div>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
              <div className="grid min-w-0 flex-1 gap-2"><Label htmlFor="agent-gap">Join gaps up to (minutes)</Label><Input id="agent-gap" type="number" min="0" max="240" value={gapMinutes} onChange={(event) => setGapMinutes(event.target.value)} /></div>
              <Button variant="outline" onClick={applyGapMinutes} disabled={agentTimeLoading}>{agentTimeLoading && <LoaderCircle className="size-3.5 animate-spin" data-icon="inline-start" />}Refresh</Button>
            </div>
            {agentTime && <>
              <div className="grid min-w-0 gap-2"><Label>Agent Time project to show</Label><Select value={agentProjectFilter} onValueChange={setAgentProjectFilter}><SelectTrigger className="w-full min-w-0 max-w-full"><SelectValue /></SelectTrigger><SelectContent position="popper" className="max-w-[calc(100vw-2rem)]"><SelectItem value="all">All projects ({availableAgentIntervals.length} intervals)</SelectItem>{[...new Set(availableAgentIntervals.map((interval) => interval.project))].map((project) => <SelectItem key={project} value={project}>{project}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid min-w-0 gap-3 rounded-lg border p-3">
                {[...new Set(availableAgentIntervals.filter((interval) => agentProjectFilter === "all" || interval.project === agentProjectFilter).map((interval) => interval.project))].map((agentProject) => <div key={agentProject} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center"><p className="min-w-0 truncate text-sm font-medium" title={agentProject}>{agentProject}</p><Select value={projectMappings[agentProject] ?? ""} onValueChange={(projectId) => saveProjectMapping(agentProject, projectId)}><SelectTrigger className="w-full min-w-0 max-w-full"><SelectValue placeholder="Map to client / project" /></SelectTrigger><SelectContent position="popper" className="max-w-[calc(100vw-2rem)]"><SelectItem value={PERSONAL_AGENT_PROJECT}>Personal — don&apos;t import</SelectItem>{data.projects.map((project) => <SelectItem key={project.id} value={project.id}>{getClient(project.clientId)?.name ? `${getClient(project.clientId)?.name} — ${project.name}` : project.name}</SelectItem>)}</SelectContent></Select></div>)}
              </div>
              <div className="min-w-0 overflow-hidden rounded-lg border">
                <div className="border-b bg-muted/35 px-3 py-2"><p className="text-sm font-medium">Review exact time to import</p><p className="text-xs text-muted-foreground">Existing tracked time has already been removed. Only the uncovered slices below will be created.</p></div>
                <div className="hidden min-w-0 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-3 border-b bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
                  <span>Uncovered time</span><span>Agent Time project</span><span>Imports to</span><span className="text-right">Duration</span>
                </div>
                <div className="min-w-0" data-testid="agent-import-review">
                  {agentImportPreview.slices.map((slice) => {
                    const mappedProject = getProject(slice.projectId)
                    const mappedProjectLabel = mappedProject ? `${getClient(mappedProject.clientId)?.name ? `${getClient(mappedProject.clientId)?.name} — ` : ""}${mappedProject.name}` : "Unknown project"
                    const wasTrimmed = slice.start !== slice.sourceStart || slice.end !== slice.sourceEnd
                    const sourceConversations = groupConversationSources(
                      slice.interval.sourceIntervals ?? [],
                      slice.start,
                      slice.end
                    )
                    const sourceLabels = [...new Set(sourceConversations.map(sourceDescription))]
                    const sourceActiveSeconds = unionRangeSeconds(sourceConversations.flatMap((source) => source.spans))
                    const joinedGapSeconds = Math.max(0, slice.durationSeconds - sourceActiveSeconds)
                    const expanded = expandedAgentSlice === slice.id
                    return <div key={slice.id} className="min-w-0 border-b last:border-b-0">
                      <button
                        type="button"
                        className="grid w-full min-w-0 cursor-pointer gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/25 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-start"
                        aria-expanded={expanded}
                        onClick={() => setExpandedAgentSlice(expanded ? null : slice.id)}
                      >
                        <div className="min-w-0"><span className="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">Uncovered time</span><p className="break-words font-mono text-xs">{format(new Date(slice.start), "MMM d, h:mm a")} – {format(new Date(slice.end), "h:mm a")}</p>{wasTrimmed && <p className="break-words text-xs text-muted-foreground">From {format(new Date(slice.sourceStart), "h:mm a")} – {format(new Date(slice.sourceEnd), "h:mm a")} block</p>}</div>
                        <div className="min-w-0"><span className="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">Agent Time project</span><p className="break-words text-xs">{slice.interval.project}</p><p className="break-words text-xs text-muted-foreground">{sourceLabels.join(" + ") || slice.interval.agents.join(" + ") || "coding"}</p></div>
                        <div className="min-w-0"><span className="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">Imports to</span><p className="break-words text-xs sm:line-clamp-2" title={mappedProjectLabel}>{mappedProjectLabel}</p></div>
                        <div className="flex min-w-0 items-start justify-between gap-2 sm:justify-end sm:text-right"><div><span className="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">Duration</span><p className="font-mono text-xs">{formatDuration(slice.durationSeconds)}</p></div><ChevronDown className={`mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} /></div>
                      </button>
                      {expanded && <div className="min-w-0 border-t bg-muted/15 px-3 py-3" data-testid="agent-source-details">
                        {sourceConversations.length > 0 && <TimelinePreview sources={sourceConversations} start={slice.start} end={slice.end} />}
                        <div className="mb-3">
                          <p className="text-xs font-medium">Where this time came from</p>
                          <p className="mt-1 text-xs text-muted-foreground">This is elapsed wall-clock time. Overlapping chats count once; their durations are not added together.</p>
                          {sourceConversations.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Agent active: <span className="font-mono text-foreground">{formatDuration(sourceActiveSeconds)}</span>{joinedGapSeconds > 0 && <> · Joined gaps: <span className="font-mono text-foreground">{formatDuration(joinedGapSeconds)}</span></>}</p>}
                        </div>
                        {sourceConversations.length > 0 ? <div className="grid min-w-0 gap-2">
                          {sourceConversations.map((source, sourceIndex) => {
                            const firstSpan = source.spans[0]
                            const lastSpan = source.spans.at(-1) ?? firstSpan
                            return <div key={`${source.source}-${source.conversationId}-${sourceIndex}`} className="min-w-0 rounded-lg border bg-background/40 p-3">
                              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0"><p className="break-words text-xs font-medium">{source.conversationTitle || `${source.agent} conversation`}</p><p className="text-xs text-muted-foreground">{sourceDescription(source)}{source.model ? ` · ${source.model}` : ""}</p></div>
                                <p className="shrink-0 font-mono text-xs">{formatDuration(source.durationSeconds)}</p>
                              </div>
                              <p className="mt-2 break-words font-mono text-[0.7rem] text-muted-foreground">{format(new Date(firstSpan.start), "MMM d, h:mm:ss a")} – {format(new Date(lastSpan.end), "h:mm:ss a")}</p>
                              {source.conversationId && <p className="mt-1 break-all font-mono text-[0.65rem] text-muted-foreground">Chat ID: {source.conversationId}</p>}
                              {source.spans.length > 1 && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer select-none">See {source.spans.length} contributing spans</summary><div className="mt-2 grid gap-1 border-l pl-2 font-mono text-[0.65rem]">{source.spans.map((span, spanIndex) => <p key={`${span.start}-${span.end}-${spanIndex}`}>{format(new Date(span.start), "h:mm:ss a")} – {format(new Date(span.end), "h:mm:ss a")}</p>)}</div></details>}
                            </div>
                          })}
                        </div> : <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">This Agent Time record predates chat attribution. Refresh after updating the desktop Agent Time service to see its chat and source.</p>}
                      </div>}
                    </div>
                  })}
                  {agentImportPreview.slices.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{agentImportPreview.unmappedProjects.length > 0 ? "Map the projects above to calculate the exact uncovered time." : "No uncovered time in this selection."}</p>}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{agentImportPreview.slices.length} exact {agentImportPreview.slices.length === 1 ? "entry" : "entries"} totaling {formatDuration(agentImportPreviewSeconds)} will import. {agentImportPreview.skippedSeconds > 0 && `${formatDuration(agentImportPreview.skippedSeconds)} already tracked is excluded. `}{agentImportPreview.unmappedProjects.length > 0 && `${agentImportPreview.unmappedProjects.length} project${agentImportPreview.unmappedProjects.length === 1 ? " needs" : "s need"} mapping. `}{selectedPersonalIntervals > 0 && `${selectedPersonalIntervals} personal interval${selectedPersonalIntervals === 1 ? " is" : "s are"} excluded.`}</p>
            </>}
            {!agentTime && !agentTimeLoading && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Load Agent Time to choose projects and review available intervals.</p>}
          </div>
          <DialogFooter className="min-w-0 rounded-b-lg"><Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button><Button onClick={() => void importAgentTime()} disabled={!agentTime || agentTimeLoading}>Import uncovered hours</Button></DialogFooter>
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
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
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
            <Button onClick={handleEditSave}>Save Changes</Button>
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
