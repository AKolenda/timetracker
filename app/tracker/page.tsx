"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
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
  ListChecks,
  ChevronsUpDown,
  Check,
  X,
  TriangleAlert,
  ChevronDown,
  EyeOff,
  FolderInput,
  Settings2,
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { TrackerReviewDialog } from "@/components/tracker-review-dialog"
import { DraftReviewDialog } from "@/components/draft-review-dialog"
import { EntryChats, type ConversationSource } from "@/components/entry-chat-audit"
import { PageHeader } from "@/components/page-header"
import { useStore } from "@/lib/store"
import { useMoney } from "@/lib/display-currency"
import { formatClock, formatDuration, formatHours, formatTimeRange as timeRange } from "@/lib/format"
import { localDateString, parseLocalDate } from "@/lib/datetime"
import { subtractRanges, occupiedProjectRanges, entryOverlapDetails, type TimeRange } from "@/lib/agent-time-overlap"
import { conversationKey, groupConversationSources } from "@/lib/agent-time-chats"
import { billedSeconds, formatBillFactor, normalizeBillFactor, sourcesBillFactor } from "@/lib/billing"
import { invoicedSourceIds } from "@/lib/invoice-estimates"
import { intervalIsSettled } from "@/lib/summary-jobs"
import { splitAgentRange } from "@/lib/agent-time-intervals"
import { PERSONAL_AGENT_PROJECT, adoptableLocalMappings, linkAgentFolders, resolveAgentMappings } from "@/lib/agent-import-projects"
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
const LOG_PAGE_SIZE = 100
const DAILY_AGENT_GAP_KEY = "timetracker-agent-time-gap-today"
const IGNORED_AGENT_RANGES_KEY = "timetracker-agent-time-ignored-ranges"

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

function demoFixtureRequested() {
  return typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" &&
    new URLSearchParams(window.location.search).get("fixture") === "demo"
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
      const durationSeconds = Math.floor((gap.end - gap.start) / 1000)
      // Sub-second slivers left beside tracked entries would approve as nothing, so they are not drafts.
      if (durationSeconds <= 0) continue
      slices.push({
        id: `${interval.id}-${gap.start}-${gap.end}`,
        interval,
        projectId,
        start: gap.start,
        end: gap.end,
        sourceStart,
        sourceEnd,
        durationSeconds,
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
    <span data-testid="today-total" className="text-xs font-semibold tabular-nums text-foreground">
      {activeTimers.some((timer) => !timer.pausedAt) ? formatLiveTotal(completedSeconds + activeSeconds) : entryClock(completedSeconds + activeSeconds)}
    </span>
  )
}

/** Saved durations as h:mm, with "<0:01" for entries that are real but round down to nothing. */
function entryClock(seconds: number) {
  return seconds > 0 && seconds < 60 ? "<0:01" : formatClock(seconds)
}

/** A total that includes a live timer ticks, so it keeps seconds but drops the leading zero: 1:47:24. */
function formatLiveTotal(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

function BilledTime({ seconds, factor, block = false }: { seconds: number; factor: number; block?: boolean }) {
  return <span data-testid="billed-time" title={`Billed at ${formatBillFactor(factor)} of the tracked time`} className={`text-xs font-normal tabular-nums text-muted-foreground ${block ? "mt-0.5 block" : ""}`}>{block ? "" : " "}bill {entryClock(seconds)} · {formatBillFactor(factor)}</span>
}

/** One machine name, with the rest behind a "+N" popover that works by keyboard and touch. */
function MachineList({ names }: { names: string[] }) {
  if (!names.length) return null
  const [first, ...rest] = names
  return <span className="inline-flex min-w-0 max-w-full items-center gap-1">
    <span className="truncate" title={first}>{first}</span>
    {rest.length > 0 && <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="shrink-0 cursor-pointer rounded-md px-1 tabular-nums hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${rest.length} more ${rest.length === 1 ? "machine" : "machines"}: ${rest.join(", ")}`}>+{rest.length}</button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-64 p-2 text-xs">
        <p className="mb-1 font-medium">Machines</p>
        <ul className="grid gap-0.5 text-muted-foreground">{names.map((name) => <li key={name}>{name}</li>)}</ul>
      </PopoverContent>
    </Popover>}
  </span>
}

function ImportProjectPicker({ value, onChange, choices }: { value: string; onChange: (value: string) => void; choices: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false)
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="outline" role="combobox" aria-expanded={open} className="w-full min-w-0 justify-between"><span className="truncate">{choices.find((choice) => choice.value === value)?.label ?? "Choose client / project"}</span><ChevronsUpDown className="ml-2 size-4 shrink-0" /></Button></PopoverTrigger>
    <PopoverContent className="w-[min(24rem,calc(100vw-3rem))] p-1" align="start"><Command><CommandInput placeholder="Search clients and projects…" /><CommandList><CommandEmpty>No matching projects.</CommandEmpty><CommandGroup>{choices.map((choice) => <CommandItem key={choice.value} value={choice.value + " " + choice.label} onSelect={() => { onChange(choice.value); setOpen(false) }}><Check className={`size-4 ${choice.value === value ? "opacity-100" : "opacity-0"}`} /><span className="min-w-0 break-words">{choice.label}</span></CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent>
  </Popover>
}

export default function TrackerPage() {
  const { money } = useMoney()
  const {
    data,
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    clearTimer,
    updateTimeEntry,
    updateSettings,
    syncAgentTimeTitles,
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
  const [draftsOpen, setDraftsOpen] = useState(false)
  // Editing a draft from the review list swaps to the edit dialog, then comes back to the list.
  const returnToDrafts = useRef(false)
  const [importSettingsOpen, setImportSettingsOpen] = useState(false)
  const [chatSummaries, setChatSummaries] = useState<Record<string, string>>({})
  const requestedSummaries = useRef(new Set<string>())
  // Choices made in this browser before folders were saved on projects; "Personal" still lives here.
  const [localMappings, setLocalMappings] = useState<Record<string, string>>(() => {
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
  const savedChatFactors = data.settings.agentTimeChatBillFactors
  const chatFactors = useMemo(() => savedChatFactors || {}, [savedChatFactors])

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

  function saveLocalMappings(update: (current: Record<string, string>) => Record<string, string>) {
    setLocalMappings((current) => {
      const next = update(current)
      try {
        localStorage.setItem("timetracker-agent-time-project-mappings", JSON.stringify(next))
      } catch {
        // The choice still applies until this page is refreshed.
      }
      return next
    })
  }

  async function saveProjectMapping(agentProject: string, projectId: string) {
    const toProject = projectId && projectId !== PERSONAL_AGENT_PROJECT ? projectId : null
    try {
      // A project choice is saved on the project, so it holds on every device and shows on the Projects page.
      for (const change of linkAgentFolders(data.projects, toProject, [agentProject])) {
        await updateProject(change.id, { agentFolders: change.agentFolders })
      }
    } catch {
      if (toProject) {
        toast.error("Couldn't link this folder to the project, so it's saved in this browser only")
        saveLocalMappings((current) => ({ ...current, [agentProject]: projectId }))
        return
      }
    }
    saveLocalMappings((current) => {
      const next = { ...current }
      if (toProject) delete next[agentProject]
      else next[agentProject] = projectId
      return next
    })
  }

  // Move this browser's older folder choices onto their projects once, so they show up everywhere.
  const adoptedLocalMappings = useRef(false)
  useEffect(() => {
    if (adoptedLocalMappings.current || !data.projects.length || mobileFixtureRequested() || demoFixtureRequested()) return
    const adoptable = adoptableLocalMappings(data.projects, localMappings)
    adoptedLocalMappings.current = true
    if (!adoptable.length) return
    void (async () => {
      let projects = data.projects
      const adopted: string[] = []
      for (const [folder, projectId] of adoptable) {
        try {
          for (const change of linkAgentFolders(projects, projectId, [folder])) {
            await updateProject(change.id, { agentFolders: change.agentFolders })
            projects = projects.map((project) => (project.id === change.id ? { ...project, agentFolders: change.agentFolders } : project))
          }
          adopted.push(folder)
        } catch {
          // Most likely migration 014 isn't applied yet; the browser's choice keeps working meanwhile.
          break
        }
      }
      if (adopted.length) {
        saveLocalMappings((current) => Object.fromEntries(Object.entries(current).filter(([folder]) => !adopted.includes(folder))))
      }
    })()
  }, [data.projects]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const projectMappings = useMemo(
    () => resolveAgentMappings(
      [...(agentTime?.projects ?? []), ...(agentTime?.intervals.map((interval) => interval.project) ?? [])],
      data.projects,
      localMappings
    ),
    [agentTime, data.projects, localMappings]
  )

  const availableAgentIntervals = useMemo(
    () => agentTime?.intervals.filter((interval) => !agentTimeCutoff || new Date(interval.end).getTime() > agentTimeCutoff) ?? [],
    [agentTime, agentTimeCutoff]
  )

  // Every render of the log needs each entry's chats; match them once per data change, not per row render.
  const entrySources = useMemo(() => {
    const intervals = agentTime?.intervals || []
    const canonicalIds = new Map<string, string>()
    for (const source of intervals.flatMap((interval) => interval.sourceIntervals || [])) {
      const key = `${source.hostUrl}|${source.source}|${source.conversationId}`
      if (source.canonicalConversationId && !canonicalIds.has(key)) canonicalIds.set(key, source.canonicalConversationId)
    }
    const projectNames = new Map(data.projects.map((project) => [project.id, project.name]))
    const result = new Map<string, AgentTimeSourceInterval[]>()
    for (const entry of data.timeEntries) {
      const start = Date.parse(entry.startTime)
      const end = entry.endTime ? Date.parse(entry.endTime) : NaN
      if (!Number.isFinite(start) || !Number.isFinite(end)) { result.set(entry.id, []); continue }
      if (entry.agentTimeSources?.length) {
        result.set(entry.id, clipAgentSources(entry.agentTimeSources.map((source) => ({
          ...source,
          canonicalConversationId: canonicalIds.get(`${source.hostUrl}|${source.source}|${source.conversationId}`) || source.canonicalConversationId,
        })), start, end))
        continue
      }
      const projectName = projectNames.get(entry.projectId)
      const matching = intervals.filter((interval) =>
        Date.parse(interval.end) > start && Date.parse(interval.start) < end && (
          projectMappings[interval.project] === entry.projectId || interval.project === projectName ||
          interval.sourceIntervals?.some((source) => (source.conversationSummary || source.conversationTitle) === entry.description))
      )
      result.set(entry.id, clipAgentSources(matching.flatMap((interval) => interval.sourceIntervals || []), start, end))
    }
    return result
  }, [agentTime, data.projects, data.timeEntries, projectMappings])
  function sourcesForEntry(entry: TimeEntry): AgentTimeSourceInterval[] {
    return entrySources.get(entry.id) ?? []
  }
  function machineNames(sources: AgentTimeSourceInterval[]) {
    return [...new Set(sources.map((source) => machineName(source, data.settings.agentTimeHostLabels)))]
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
      const demo = process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" && new URLSearchParams(window.location.search).get("fixture") === "demo"
      const fixture = mobileFixtureRequested() ? "&fixture=mobile" : demo ? "&fixture=demo" : ""
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
  const latestStartTimer = useRef(startTimer)
  latestStartTimer.current = startTimer
  useEffect(() => {
    const savedIds = new Set(data.timeEntries.map((entry) => entry.id))
    importedEntries.current = importedEntries.current.filter((entry) => !savedIds.has(entry.id))
  }, [data.timeEntries])
  const [importing, setImporting] = useState(false)
  const overlapDetails = useMemo(() => entryOverlapDetails(data.timeEntries, data.activeTimers), [data.timeEntries, data.activeTimers])
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
          const sources = groupConversationSources(entry.agentTimeSources || [], gap.start, gap.end).filter((source) => source.conversationId)
          const saved = await addTimeEntry({
            ...entry,
            agentTimeTitleStatus: generateTitles && sources.length ? "pending" : null,
            agentTimeSources: clipAgentSources(entry.agentTimeSources || [], gap.start, gap.end),
            billFactor: sourcesBillFactor(entry.agentTimeSources || [], gap.start, gap.end, current.settings.agentTimeChatBillFactors),
            startTime: new Date(gap.start).toISOString(),
            endTime: new Date(gap.end).toISOString(),
            duration,
            date: localDateString(new Date(gap.start), current.settings.timezone),
          })
          importedEntries.current.push(saved)
          seconds += duration
        }
      }
      if (seconds) toast.success(`Approved ${entryClock(seconds)}. Overlapping time excluded.`)
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

  const pendingTitleIds = JSON.stringify(data.timeEntries.filter((entry) => entry.agentTimeTitleStatus === "pending").map((entry) => entry.id).sort().slice(0, 100))
  useEffect(() => {
    const ids = JSON.parse(pendingTitleIds) as string[]
    if (!ids.length) return
    let stopped = false
    let running = false
    async function poll() {
      if (running) return
      running = true
      try {
        const response = await fetch("/api/agent-time/title-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) })
        if (!response.ok) return
        const result = await response.json() as { entries: Pick<TimeEntry, "id" | "description" | "agentTimeTitleStatus">[] }
        if (!stopped) syncAgentTimeTitles(result.entries)
      } finally { running = false }
    }
    void poll().catch(() => undefined)
    const timer = setInterval(() => { void poll().catch(() => undefined) }, 5000)
    return () => { stopped = true; clearInterval(timer) }
  }, [pendingTitleIds, syncAgentTimeTitles])

  async function setChatBillFactor(chat: ConversationSource, factor: number) {
    const key = conversationKey(chat)
    const next = { ...chatFactors }
    if (normalizeBillFactor(factor) === 1) delete next[key]
    else next[key] = normalizeBillFactor(factor)
    try {
      await updateSettings({ agentTimeChatBillFactors: next })
      // Invoiced entries keep the amount they were billed at.
      const invoiced = invoicedSourceIds(data.invoices, "time")
      const updates = data.timeEntries.flatMap((entry) => {
        if (!entry.agentTimeSources?.length || !entry.endTime || invoiced.has(entry.id)) return []
        const sources = sourcesForEntry(entry)
        if (!sources.some((source) => conversationKey(source) === key)) return []
        const billFactor = sourcesBillFactor(sources, Date.parse(entry.startTime), Date.parse(entry.endTime), next)
        return billFactor === normalizeBillFactor(entry.billFactor ?? 1) ? [] : [updateTimeEntry(entry.id, { billFactor })]
      })
      await Promise.all(updates)
      toast.success(`Billing ${formatBillFactor(normalizeBillFactor(factor))} of “${chat.conversationTitle || "this chat"}”${updates.length ? ` · ${updates.length} saved ${updates.length === 1 ? "entry" : "entries"} updated` : ""}`)
    } catch {
      toast.error("Could not save the billing rate for this chat")
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

  async function approveDrafts(slices: AgentImportSlice[]) {
    if (!slices.length) return
    await importDraftEntries(slices.map(draftEntry))
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
    const timer = data.activeTimers.find((current) => current.id === id)
    clearTimer(id)
    if (!timer) return
    toast("Timer discarded", {
      description: timer.description || getProject(timer.projectId)?.name,
      duration: 8000,
      action: {
        label: "Undo",
        // The store's startTimer closes over the timers it rendered with, so use the latest one.
        onClick: () => {
          if (latestData.current.activeTimers.some((current) => current.id === timer.id)) return
          latestStartTimer.current(timer)
          toast.success("Timer restored")
        },
      },
    })
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
    backToDrafts()
  }

  function backToDrafts() {
    if (!returnToDrafts.current) return
    returnToDrafts.current = false
    setDraftsOpen(true)
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

  // Every mounted row adds to the style work dialogs and popovers trigger, so older history renders on request.
  const [visibleRowCount, setVisibleRowCount] = useState(LOG_PAGE_SIZE)
  const visibleRows = logRows.slice(0, visibleRowCount)
  function revealEntry(id: string) {
    const index = logRows.findIndex((row) => row.kind === "entry" && row.entry.id === id)
    if (index >= visibleRowCount) setVisibleRowCount(Math.ceil((index + 1) / LOG_PAGE_SIZE) * LOG_PAGE_SIZE)
  }

  const hostLabels = data.settings.agentTimeHostLabels
  const draftDetails = useMemo(() => new Map(agentImportPreview.slices.map((slice) => {
    const sources = slice.interval.sourceIntervals || []
    return [slice.id, {
      description: draftDescription(slice, chatSummaries),
      machines: [...new Set(clipAgentSources(sources, slice.start, slice.end).map((source) => machineName(source, hostLabels)))],
      billFactor: sourcesBillFactor(sources, slice.start, slice.end, chatFactors),
    }]
  })), [agentImportPreview.slices, chatSummaries, chatFactors, hostLabels])

  // Generate a separate title from the messages within each interval.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const slice of agentImportPreview.slices) {
        if (cancelled) break
        if (!intervalIsSettled(slice.end)) continue
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
    skipDrafts([slice])
  }

  function skipDrafts(slices: AgentImportSlice[]) {
    if (!slices.length) return
    const ranges: IgnoredAgentRange[] = slices.map((slice) => ({
      id: `${slice.interval.project}:${slice.start}:${slice.end}`,
      agentProject: slice.interval.project,
      start: slice.start,
      end: slice.end,
    }))
    setIgnoredAgentRanges((current) => {
      const added = ranges.filter((range) => !current.some((existing) => existing.id === range.id))
      if (!added.length) return current
      const next = [...current, ...added]
      persistIgnoredAgentRanges(next)
      return next
    })
    toast(slices.length === 1 ? "Skipped" : `Skipped ${slices.length} drafts`, {
      description: slices.length === 1
        ? `${format(new Date(slices[0].start), "MMM d, h:mm a")} – ${format(new Date(slices[0].end), "h:mm a")}`
        : "Restore them from Import settings.",
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

  const timerProjectLabel = (() => {
    const project = timerProject ? getProject(timerProject) : undefined
    if (!project) return undefined
    const client = getClient(project.clientId)
    return `${client?.name ? `${client.name} — ` : ""}${project.name}`
  })()
  // On stacked rows (below lg) the row actions sit beside the title, so the second line can use the full width.
  // The title stops 8px short of the actions so its chat chevron isn't a near-miss for Resume.
  const rowTitleClass = "max-lg:flex max-lg:min-h-9 max-lg:items-center max-lg:pr-29"
  const rowActionsClass = "max-lg:absolute max-lg:top-2 max-lg:right-2 max-lg:p-0 max-lg:pointer-fine:top-3.5"
  const rowActionGroupClass = "flex items-center justify-end gap-0.5 max-lg:gap-0"
  // Utilities that open dialogs: outline buttons from lg up, one labelled menu on phones and tablets.
  const reviewTools = [
    { id: "review-saved-overlaps", label: "Saved conflicts", icon: TriangleAlert, count: overlapIds.size, open: () => setReviewEntryOverlapsOpen(true) },
    { id: "review-agent-overlaps", label: "Excluded time", icon: EyeOff, count: 0, open: () => setReviewAgentOverlapsOpen(true) },
    { id: "review-agent-projects", label: "Project mappings", icon: FolderInput, count: 0, open: () => setProjectsOpen(true) },
    { id: "import-settings", label: "Import settings", icon: Settings2, count: 0, open: () => setImportSettingsOpen(true) },
  ]

  return (
    <>
      <PageHeader
        title="Tracker"
      />

      <Card className="mb-6">
        <CardContent>
          {data.projects.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Create a client and project first to start tracking time
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center lg:grid-cols-[minmax(0,1fr)_220px_auto] xl:grid-cols-[minmax(0,1fr)_260px_auto]">
                <Input
                  data-testid="timer-description"
                  aria-label="What are you working on?"
                  placeholder="What are you working on?"
                  value={timerDesc}
                  onChange={(e) => setTimerDesc(e.target.value)}
                  className="h-10 min-w-0 w-full sm:col-span-2 lg:col-span-1"
                />
                <Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button data-testid="timer-project-picker" variant="outline" role="combobox" aria-expanded={projectPickerOpen} aria-label={`Project: ${timerProjectLabel ?? "none selected"}`} className="h-10 min-w-0 w-full justify-between font-normal" >
                      <span className={`truncate ${timerProjectLabel ? "" : "text-muted-foreground"}`}>{timerProjectLabel ?? "Select project"}</span>
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
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 shrink-0 items-center gap-2">
                    <Checkbox
                      data-testid="timer-billable"
                      id="timer-billable"
                      checked={timerBillable}
                      onCheckedChange={(v) => setTimerBillable(v === true)}
                    />
                    <Label htmlFor="timer-billable" className="text-sm font-normal text-muted-foreground">
                      Billable
                    </Label>
                  </div>
                  <Button
                    data-testid="timer-start"
                    onClick={handleStart}
                    className="h-10 flex-1 px-4 sm:flex-none"
                  >
                    <Play className="size-3.5" data-icon="inline-start" />
                    Start timer
                  </Button>
                </div>
              </div>

              {activeTimers.length === 0 ? <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"><Clock className="size-5" />No active timers</div> : <div className="grid gap-2">{activeTimers.map((timer) => {
                const project = getProject(timer.projectId)
                return <div key={timer.id} data-testid="active-timer" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3">
                  <Clock className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-[9rem] flex-1"><p className="font-medium break-words">{timer.description || project?.name || "Untitled"}</p><p className="text-xs text-muted-foreground">{project?.name ?? "Unknown project"}</p></div>
                  <LiveTimer startTime={timer.startTime} pausedAt={timer.pausedAt} accumulatedPause={timer.accumulatedPause} />
                  {timer.pausedAt && <Badge variant="secondary" className="animate-pulse text-xs">Paused</Badge>}
                  <div className="ml-auto flex flex-wrap gap-2">
                    {timer.pausedAt ? <Button variant="outline" onClick={() => resumeTimer(timer.id)}><Play className="size-3.5" data-icon="inline-start" />Resume</Button> : <Button onClick={() => pauseTimer(timer.id)} variant="outline"><Pause className="size-3.5" data-icon="inline-start" />Pause</Button>}
                    <Button onClick={() => handleStop(timer.id)}><Square className="size-3 fill-current" data-icon="inline-start" />Stop &amp; save</Button>
                    <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20" onClick={() => handleDiscard(timer.id)}><Trash2 className="size-3.5" data-icon="inline-start" />Discard</Button>
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
            {agentImportPreview.slices.length > 0 && <Button variant="outline" size="sm" data-testid="review-drafts" onClick={() => setDraftsOpen(true)}>
              <ListChecks className="size-3.5" data-icon="inline-start" />
              Review drafts
            </Button>}
            {agentImportPreview.slices.length > 0 && <Button
              size="sm"
              data-testid="approve-all-drafts"
              className="bg-warning text-amber-950 hover:bg-warning/85"
              onClick={() => void approveAllDrafts()}
              disabled={agentTimeLoading || importing}
            >
              <Check className="size-3.5" data-icon="inline-start" />
              Approve {agentImportPreview.slices.length} {agentImportPreview.slices.length === 1 ? "draft" : "drafts"} · <span className="tabular-nums">{formatClock(agentImportPreviewSeconds)}</span>
            </Button>}
            <Button variant="outline" size="sm" onClick={() => setAddHoursOpen(true)}>
              <Plus className="size-3.5" data-icon="inline-start" />
              Add hours
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden" data-testid="review-tools-menu">
                  Review{overlapIds.size > 0 && <span className="rounded-md bg-destructive/10 px-1.5 text-xs tabular-nums text-destructive">{overlapIds.size}</span>}
                  <ChevronDown className="size-3.5" data-icon="inline-end" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                {reviewTools.map((tool) => <DropdownMenuItem key={tool.id} data-testid={`${tool.id}-menu`} onSelect={tool.open}>
                  <tool.icon className="size-4" />
                  <span className="flex-1">{tool.label}…</span>
                  {tool.count > 0 && <span className="text-xs tabular-nums text-destructive">{tool.count}</span>}
                </DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <div data-testid="agent-time-controls" className="mb-3 hidden min-w-0 flex-wrap items-center gap-2 lg:flex">
            {reviewTools.map((tool) => <Button key={tool.id} type="button" variant="outline" size="sm" data-testid={tool.id} aria-haspopup="dialog" onClick={tool.open}>
              <tool.icon className="size-3.5 text-muted-foreground" data-icon="inline-start" />
              {tool.label}
              {tool.count > 0 && <span className="rounded-md bg-destructive/10 px-1.5 text-xs tabular-nums text-destructive">{tool.count}</span>}
            </Button>)}
          </div>
          {overlapIds.size > 0 && <div data-testid="overlap-summary" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
            <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="min-w-0 flex-1"><span className="font-medium tabular-nums">{overlapIds.size} saved {overlapIds.size === 1 ? "entry overlaps" : "entries overlap"} other time.</span> <span className="text-muted-foreground max-sm:hidden">They&apos;re marked in red below.</span></p>
            <Button type="button" variant="outline" size="sm" aria-haspopup="dialog" onClick={() => setReviewEntryOverlapsOpen(true)}>Review conflicts</Button>
          </div>}
          {logRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No time entries yet</p>
          ) : (
            <div className="overflow-hidden rounded-lg border max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0 [&_[data-slot=table-container]]:overflow-x-hidden">
              <Table>
            <TableHeader className="hidden lg:table-header-group">
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="w-[18%] xl:w-[20%]">Project</TableHead>
                <TableHead className="w-36 xl:w-40">Time</TableHead>
                <TableHead className="w-20 text-right xl:w-24">Duration</TableHead>
                <TableHead className="w-20 text-right xl:w-24">Amount</TableHead>
                <TableHead className="w-px"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logRows[0]?.date !== todayEntryDate && <TableRow className="bg-muted/35 hover:bg-muted/35"><TableCell colSpan={6} className="py-2 whitespace-normal"><div className="flex min-w-0 items-center justify-between gap-3 text-xs font-semibold text-muted-foreground"><span>Today</span><span className="inline-flex items-center gap-2"><span>Today&apos;s total</span><TodayTotal completedSeconds={todayCompletedSeconds} activeTimers={activeTimers} /></span></div></TableCell></TableRow>}
              {visibleRows.map((row, index) => {
                const isNewDay = index === 0 || row.date !== visibleRows[index - 1]?.date
                const isToday = row.date === todayEntryDate
                const dayLabel = isToday ? "Today" : format(parseLocalDate(row.date), "EEEE, MMMM d, yyyy")
                const dayHeader = isNewDay && <TableRow className="bg-muted/35 hover:bg-muted/35"><TableCell colSpan={6} className="py-2 whitespace-normal"><div className="flex w-0 min-w-full items-center justify-between gap-3 text-xs font-semibold text-muted-foreground"><span className="truncate">{dayLabel}</span>{isToday && <span className="inline-flex items-center gap-2"><span>Today&apos;s total</span><TodayTotal completedSeconds={todayCompletedSeconds} activeTimers={activeTimers} /></span>}</div></TableCell></TableRow>
                if (row.kind === "draft") {
                  const slice = row.slice
                  const project = getProject(slice.projectId)
                  const { description: draftTitle, machines: draftMachines, billFactor } = draftDetails.get(slice.id)!
                  const amount = project ? (billedSeconds({ duration: slice.durationSeconds, billFactor }) / 3600) * project.rate : 0
                  const range = timeRange(slice.start, slice.end)
                  return <Fragment key={slice.id}>
                    {dayHeader}
                    <TableRow data-testid="agent-draft-row" className="bg-warning/[0.07] hover:bg-warning/[0.12] max-lg:relative">
                      <TableCell className="font-medium whitespace-normal break-words">
                        <div className={rowTitleClass}><EntryChats description={draftTitle} sources={slice.interval.sourceIntervals || []} start={slice.start} end={slice.end} labels={data.settings.agentTimeHostLabels || {}} chatFactors={chatFactors} onSetChatFactor={(chat, factor) => void setChatBillFactor(chat, factor)} /></div>
                        {draftMachines.length > 0 && <p className="mt-0.5 hidden text-xs font-normal text-muted-foreground lg:block"><MachineList names={draftMachines} /></p>}
                        <div className="mt-0.5 w-0 min-w-full space-y-0.5 text-xs font-normal text-muted-foreground lg:hidden">
                          <p className="line-clamp-2 break-words">{project?.name ?? "—"}{draftMachines.length > 0 && <> · <MachineList names={draftMachines} /></>}</p>
                          <div className="flex flex-wrap items-center gap-x-2"><span className="tabular-nums">{range}</span>
                          <span className="ml-auto tabular-nums"><span className="text-warning-foreground">{entryClock(slice.durationSeconds)}</span>{billFactor < 1 && <BilledTime seconds={billedSeconds({ duration: slice.durationSeconds, billFactor })} factor={billFactor} />}{amount ? ` · ${money(amount, project?.currency)}` : ""}</span></div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden whitespace-normal lg:table-cell"><span className="line-clamp-2 text-xs text-muted-foreground" title={project?.name}>{project?.name ?? "—"}</span></TableCell>
                      <TableCell className="hidden text-xs tabular-nums lg:table-cell">{range}</TableCell>
                      <TableCell className="hidden text-right text-xs tabular-nums text-warning-foreground lg:table-cell">{entryClock(slice.durationSeconds)}{billFactor < 1 && <BilledTime block seconds={billedSeconds({ duration: slice.durationSeconds, billFactor })} factor={billFactor} />}</TableCell>
                      <TableCell className="hidden text-right text-xs tabular-nums text-muted-foreground lg:table-cell">{amount ? money(amount, project?.currency) : "—"}</TableCell>
                      <TableCell className={rowActionsClass}><div className={rowActionGroupClass}>
                        <Button variant="ghost" size="icon-xs" data-testid="approve-draft" disabled={importing} aria-label="Approve" title="Approve" className="text-warning-foreground hover:bg-warning/20 hover:text-warning-foreground" onClick={() => void approveDraft(slice)}><Check className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon-xs" aria-label="Edit and approve" title="Edit and approve" onClick={() => openDraftEdit(slice)}><Pencil className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon-xs" data-testid="ignore-agent-slice" aria-label="Skip" title="Skip" onClick={() => ignoreAgentSlice(slice)}><Trash2 className="size-3.5" /></Button>
                      </div></TableCell>
                    </TableRow>
                  </Fragment>
                }
                const entry = row.entry
                const project = getProject(entry.projectId)
                const billFactor = normalizeBillFactor(entry.billFactor ?? 1)
                const entryChatSources = sourcesForEntry(entry)
                const entryMachines = machineNames(entryChatSources)
                const amount = entry.billable && project ? (billedSeconds(entry) / 3600) * project.rate : 0
                const overlaps = overlapIds.has(entry.id)
                const range = entry.endTime ? timeRange(entry.startTime, entry.endTime) : "No exact times"
                const overlapMarker = overlaps && <span role="img" aria-label="Overlaps other time" title="Overlaps other time. Review it in Saved conflicts." className="inline-flex shrink-0 text-destructive"><TriangleAlert className="size-3.5" aria-hidden="true" /></span>
                return <Fragment key={entry.id}>
                  {dayHeader}
                  <TableRow id={`time-entry-${entry.id}`} tabIndex={-1} data-highlighted={highlightedEntry === entry.id || undefined} data-overlap={overlaps || undefined} aria-label={entry.description || "Untitled time entry"} className={`max-lg:relative ${highlightedEntry === entry.id ? "bg-warning/15 outline-2 -outline-offset-2 outline-warning" : ""}`}>
                  <TableCell className={`font-medium whitespace-normal break-words ${overlaps ? "shadow-[inset_2px_0_0_var(--destructive)]" : ""}`}>
                    <div className={rowTitleClass}><EntryChats description={entry.description} sources={entryChatSources} start={Date.parse(entry.startTime)} end={entry.endTime ? Date.parse(entry.endTime) : NaN} labels={data.settings.agentTimeHostLabels || {}} inferred={!entry.agentTimeSources?.length} chatFactors={chatFactors} onSetChatFactor={entry.agentTimeSources?.length ? (chat, factor) => void setChatBillFactor(chat, factor) : undefined} /></div>
                    {entry.agentTimeTitleStatus === "pending" && <span role="status" data-testid="entry-title-loading" className="mt-1 inline-flex items-center gap-1.5 rounded-md text-xs font-normal text-muted-foreground"><LoaderCircle className="size-3 animate-spin" aria-hidden="true" />Naming…</span>}
                    {entry.agentTimeTitleStatus === "failed" && <button type="button" className="mt-1 block cursor-pointer rounded-md text-xs font-normal text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" onClick={() => { void updateTimeEntry(entry.id, { agentTimeTitleStatus: "pending" }).catch(() => toast.error("Could not retry naming")) }}>Naming failed · Retry</button>}
                    {entryMachines.length > 0 && <p className="mt-0.5 hidden text-xs font-normal text-muted-foreground lg:block"><MachineList names={entryMachines} /></p>}
                    <div className="mt-0.5 w-0 min-w-full space-y-0.5 text-xs font-normal text-muted-foreground lg:hidden">
                      <p className="line-clamp-2 break-words">{project?.name ?? "—"}{entryMachines.length > 0 && <> · <MachineList names={entryMachines} /></>}</p>
                      <div className="flex flex-wrap items-center gap-x-2"><span className="inline-flex items-center gap-1"><span className="tabular-nums">{range}</span>{overlapMarker}</span>
                      <span className="ml-auto tabular-nums"><span className="text-foreground">{entryClock(entry.duration)}</span>{billFactor < 1 && <BilledTime seconds={billedSeconds(entry)} factor={billFactor} />}{amount ? ` · ${money(amount, project?.currency)}` : ""}</span></div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal lg:table-cell">
                    <button type="button" className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default" disabled={!project} aria-label={project ? `Edit project ${project.name}` : "Unknown project"} title={project ? `Edit ${project.name}` : undefined} onClick={() => project && setProjectEdit({ id: project.id, name: project.name, rate: String(project.rate) })}>
                      <span className="line-clamp-2">{project?.name ?? "—"}</span>{project && <Pencil className="size-3 shrink-0 opacity-60" aria-hidden="true" />}
                    </button>
                  </TableCell>
                  <TableCell className="hidden text-xs tabular-nums lg:table-cell"><span className="inline-flex items-center gap-1.5">{range}{overlapMarker}</span></TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums lg:table-cell">{entryClock(entry.duration)}{billFactor < 1 && <BilledTime block seconds={billedSeconds(entry)} factor={billFactor} />}</TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums text-muted-foreground lg:table-cell">{amount ? money(amount, project?.currency) : "—"}</TableCell>
                  <TableCell className={rowActionsClass}><div className={rowActionGroupClass}>
                    <Button variant="ghost" size="icon-xs" aria-label="Resume timer" title="Resume timer" onClick={() => handleResume(entry)}><Play className="size-3.5 fill-current" /></Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Edit entry" title="Edit entry" onClick={() => openEdit(entry)}><Pencil className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon-xs" aria-label="Delete entry" title="Delete entry" onClick={() => setDeleteTarget(entry)}><Trash2 className="size-3.5" /></Button>
                  </div></TableCell>
                  </TableRow>
                </Fragment>
              })}
            </TableBody>
              </Table>
            </div>
          )}
          {logRows.length > visibleRowCount && <Button type="button" variant="outline" size="sm" data-testid="show-older-entries" className="mt-3 w-full" onClick={() => setVisibleRowCount((count) => count + LOG_PAGE_SIZE)}>Show older entries ({logRows.length - visibleRowCount} more)</Button>}
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
          const timeLabel = `${format(new Date(entry.startTime), "EEE, MMM d, yyyy")} · ${timeRange(entry.startTime, entry.endTime!)}`
          return { id: entry.id, searchText: `${entry.description} ${project?.name} ${client?.name} ${timeLabel}`, content: <div data-testid="saved-overlap-review-item">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-words font-medium">{entry.description || "Untitled"}</p>
              <Button type="button" variant="ghost" size="icon-sm" data-testid="find-conflict-in-log" aria-label="Find entry in time log" title="Find in time log" onClick={() => { jumpToEntry.current = entry.id; revealEntry(entry.id); setHighlightedEntry(entry.id); setReviewEntryOverlapsOpen(false) }}><ArrowUpRight className="size-4" /></Button>
            </div>
            <p data-testid="overlap-minutes" className="mb-1 text-sm font-medium tabular-nums text-destructive">{new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format((overlapDetails.get(entry.id)?.overlapMilliseconds ?? 0) / 60_000)} min overlapping</p>
            <p className="break-words text-xs text-muted-foreground">{client?.name} / {project?.name ?? "Unknown project"}</p>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">{timeLabel}</p>
            <div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => { setReviewEntryOverlapsOpen(false); openEdit(entry) }}>Edit times</Button><Button type="button" variant="ghost" size="sm" data-testid="dismiss-saved-overlap" onClick={() => saveOverlapReviews("entry", [...reviewedEntryOverlaps, entryOverlapKeys.get(entry.id)!])}><X className="size-3" />Dismiss flag</Button></div>
          </div> }
        })}
      />
      <TrackerReviewDialog open={reviewAgentOverlapsOpen} onOpenChange={setReviewAgentOverlapsOpen} title="Excluded time" description="Already covered time is kept out of imports. Review these blocks at your own pace." emptyText="All excluded time reviewed."
        actions={<>{pendingAgentOverlaps.length > 0 && <Button variant="outline" size="sm" onClick={() => saveOverlapReviews("agent", [...new Set([...reviewedAgentOverlaps, ...pendingAgentOverlaps.map((item) => item.key)])])}>Dismiss all reviewed</Button>}{reviewedAgentOverlaps.length > 0 && <Button variant="ghost" size="sm" onClick={() => saveOverlapReviews("agent", [])}>Show dismissed blocks</Button>}</>}
        items={pendingAgentOverlaps.map((overlap) => {
          const project = getProject(overlap.projectId)
          const client = getClient(project?.clientId ?? "")
          const timeLabel = `${format(new Date(overlap.start), "EEE, MMM d, yyyy")} · ${timeRange(overlap.start, overlap.end)}`
          return { id: overlap.key, searchText: `${project?.name} ${client?.name} ${timeLabel}`, content: <div data-testid="agent-overlap-item" className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1"><p className="break-words font-medium">{project?.name ?? "Unknown project"}</p><p className="text-xs text-muted-foreground">{client?.name}</p><p className="mt-1 text-xs tabular-nums text-muted-foreground">{timeLabel}</p><p className="mt-1 text-xs tabular-nums">{entryClock(Math.floor((overlap.end - overlap.start) / 1000))} excluded</p></div>
            <Button type="button" variant="ghost" size="icon-sm" data-testid="dismiss-agent-overlap-warning" aria-label="Dismiss reviewed agent overlap" onClick={() => saveOverlapReviews("agent", [...reviewedAgentOverlaps, overlap.key])}><X className="size-4" /></Button>
          </div> }
        })}
      />
      <DraftReviewDialog open={draftsOpen} onOpenChange={setDraftsOpen} busy={agentTimeLoading || importing} totalSeconds={agentImportPreviewSeconds}
        onApprove={(ids) => void approveDrafts(agentImportPreview.slices.filter((slice) => ids.includes(slice.id)))}
        onSkip={(ids) => skipDrafts(agentImportPreview.slices.filter((slice) => ids.includes(slice.id)))}
        onEdit={(id) => { const slice = agentImportPreview.slices.find((s) => s.id === id); if (!slice) return; returnToDrafts.current = true; setDraftsOpen(false); openDraftEdit(slice) }}
        onApproveAll={() => void approveAllDrafts()}
        items={[...agentImportPreview.slices].sort((a, b) => b.start - a.start).map((slice) => {
          const project = getProject(slice.projectId)
          const client = project ? getClient(project.clientId) : undefined
          const { description: draftTitle, machines: draftMachines, billFactor } = draftDetails.get(slice.id)!
          const amount = project ? (billedSeconds({ duration: slice.durationSeconds, billFactor }) / 3600) * project.rate : 0
          // Skip the client when it only repeats the project's name ("ASCEND · ASCEND").
          const owner = client && client.name.trim().toLowerCase() !== project?.name.trim().toLowerCase() ? ` · ${client.name}` : ""
          return {
            id: slice.id,
            start: slice.start,
            end: slice.end,
            durationSeconds: slice.durationSeconds,
            title: draftTitle,
            titleNode: <EntryChats description={draftTitle} sources={slice.interval.sourceIntervals || []} start={slice.start} end={slice.end} labels={data.settings.agentTimeHostLabels || {}} chatFactors={chatFactors} onSetChatFactor={(chat, factor) => void setChatBillFactor(chat, factor)} />,
            meta: `${project?.name ?? "—"}${owner}${draftMachines.length ? ` · ${draftMachines.join(", ")}` : ""}`,
            amount: amount ? money(amount, project?.currency) : "",
            billed: billFactor < 1 ? <BilledTime block seconds={billedSeconds({ duration: slice.durationSeconds, billFactor })} factor={billFactor} /> : undefined,
            searchText: [draftTitle, project?.name, client?.name, ...draftMachines, format(new Date(slice.start), "EEEE MMMM d yyyy h:mm a")].join(" "),
          }
        })}
      />
      <TrackerReviewDialog open={projectsOpen} onOpenChange={setProjectsOpen} title="Project mappings" description="Choose where each agent folder's time goes. It's saved on the project, so you can also change it on the Projects page. Personal folders stay out of imports." emptyText="No desktop projects to map."
        items={[...unmappedAgentProjects, ...handledAgentProjects].map((agentProject) => ({ id: agentProject, searchText: `${agentProject} ${getProject(projectMappings[agentProject])?.name ?? ""}`, content: <div data-testid="import-project-row" className="grid min-w-0 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="min-w-0"><p className="break-words text-sm font-medium">{agentProject}</p>{!projectMappings[agentProject] && <p className="text-xs text-muted-foreground">Choose a destination</p>}</div>
          <ImportProjectPicker value={projectMappings[agentProject] ?? ""} onChange={(value) => saveProjectMapping(agentProject, value)} choices={[{ value: PERSONAL_AGENT_PROJECT, label: "Personal — don't import" }, ...data.projects.map((project) => ({ value: project.id, label: `${getClient(project.clientId)?.name ?? ""} / ${project.name}` }))]} />
        </div> }))}
      />
      <Dialog open={importSettingsOpen} onOpenChange={setImportSettingsOpen}>
        <DialogContent><DialogHeader><DialogTitle>Import settings</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Adjust gap grouping and the period included in your review.</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <div className="flex h-8 items-center rounded-md border border-input bg-background pl-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30" title="Join gaps up to this many minutes">
                <label htmlFor="tracker-agent-gap">Gap</label>
                <Input id="tracker-agent-gap" data-testid="tracker-agent-gap" aria-label="Join gaps up to (minutes)" type="number" min="0" max="240" inputMode="numeric" value={gapMinutes} onChange={(event) => setGapMinutes(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applyGapMinutes() }} className="h-7 w-12 border-0 bg-transparent px-1 text-center text-[16px] tabular-nums text-foreground shadow-none focus-visible:ring-0 sm:text-xs dark:bg-transparent" />
                <span className="pr-3">min</span>
              </div>
              <Button data-testid="apply-agent-gap" type="button" variant="outline" size="sm" className="h-8" onClick={applyGapMinutes} disabled={agentTimeLoading}>{agentTimeLoading && <LoaderCircle className="size-3.5 animate-spin" data-icon="inline-start" />}Refresh</Button>
              {!agentTimeStartDate || agentTimeStartDate <= HARD_AGENT_TIME_START_DATE
                ? <Button type="button" variant="ghost" size="sm" className="h-8" onClick={startWatchingAgentTimeToday}>Start fresh today</Button>
                : <Button type="button" variant="ghost" size="sm" className="h-8" onClick={showAllAgentTime}>Since {format(parseLocalDate(HARD_AGENT_TIME_START_DATE), "MMM d")}</Button>}
              {agentImportPreview.ignoredSeconds > 0 && <Button data-testid="restore-ignored-agent-slices" type="button" variant="ghost" size="sm" className="h-8" onClick={restoreVisibleIgnoredAgentRanges}>Restore skipped <span className="ml-1 tabular-nums">{formatClock(agentImportPreview.ignoredSeconds)}</span></Button>}
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
              <Label htmlFor="hours-project">Project</Label>
              <Select value={hoursForm.projectId} onValueChange={(projectId) => setHoursForm({ ...hoursForm, projectId })}>
                <SelectTrigger id="hours-project" className="w-full"><SelectValue placeholder="Select project" /></SelectTrigger>
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
            <div className="grid gap-2"><Label htmlFor="project-edit-name">Project name</Label><Input id="project-edit-name" value={projectEdit?.name ?? ""} onChange={(e) => setProjectEdit((p) => p ? { ...p, name: e.target.value } : p)} /></div>
            <div className="grid gap-2"><Label htmlFor="project-edit-rate">Hourly rate</Label><Input id="project-edit-rate" type="number" min="0" step="0.01" value={projectEdit?.rate ?? ""} onChange={(e) => setProjectEdit((p) => p ? { ...p, rate: e.target.value } : p)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setProjectEdit(null)}>Cancel</Button><Button onClick={saveProjectEdit}>Save changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) { setEditEntry(null); setEditDraft(null); backToDrafts() } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editDraft ? "Approve draft" : "Edit Time Entry"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-project">Project</Label>
              <Select
                value={editForm.projectId}
                onValueChange={(v) =>
                  setEditForm({ ...editForm, projectId: v })
                }
              >
                <SelectTrigger id="edit-project" className="w-full">
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
                <Label htmlFor="edit-start">Start time</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="edit-start"
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
                          aria-label="Start time of day"
                          className="tabular-nums"
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-end">End time</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="edit-end"
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
                          aria-label="End time of day"
                          className="tabular-nums"
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
              <span className="text-sm font-medium tabular-nums">
                {editDuration > 0 ? entryClock(editDuration) : "—"}
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
              {deleteTarget ? entryClock(deleteTarget.duration) : ""}). This
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
