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
import type { TimeEntry } from "@/lib/types"

type AgentTimeInterval = {
  id: string
  start: string
  end: string
  project: string
  agents: string[]
  durationSeconds: number
  activitySeconds: number
  live?: boolean
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

function mobileFixtureRequested() {
  return typeof window !== "undefined" &&
    process.env.NEXT_PUBLIC_E2E_FIXTURES === "true" &&
    new URLSearchParams(window.location.search).get("fixture") === "mobile"
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
  const [gapMinutes, setGapMinutes] = useState("15")
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
    void loadAgentTime(true)
  }, [])

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

  async function loadAgentTime(silent = false) {
    setAgentTimeLoading(true)
    try {
      const gap = Math.max(0, Number(gapMinutes) || 15)
      const fixture = mobileFixtureRequested() ? "&fixture=mobile" : ""
      const response = await fetch(`/api/agent-time?gapMinutes=${gap}&from=${HARD_AGENT_TIME_START_DATE}${fixture}`)
      if (!response.ok) throw new Error("Agent Time is not available")
      const payload = (await response.json()) as AgentTimeResponse
      setAgentTime(payload)
      setAgentProjectFilter("all")
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not load Agent Time")
    } finally {
      setAgentTimeLoading(false)
    }
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
  const todayEntryDate = localDateString(new Date(), data.settings.timezone)

  const unimportedAgentTime = useMemo(() => {
    if (!agentTime) return { seconds: 0, blocks: 0, unmappedProjects: [] as string[] }
    const plan = buildAgentImportPlan(
      agentTime.intervals,
      projectMappings,
      data.timeEntries,
      agentTimeCutoff
    )
    return {
      seconds: plan.slices.reduce((total, slice) => total + slice.durationSeconds, 0) + plan.unmappedSeconds,
      blocks: plan.slices.length + plan.unmappedBlocks,
      unmappedProjects: plan.unmappedProjects,
    }
  }, [agentTime, agentTimeCutoff, data.timeEntries, projectMappings])

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

      {unimportedAgentTime.seconds > 0 && (
        <Card className="mb-6 border-amber-500/40 bg-amber-500/5">
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
              <Button variant="outline" onClick={() => void loadAgentTime()} disabled={agentTimeLoading}>{agentTimeLoading && <LoaderCircle className="size-3.5 animate-spin" data-icon="inline-start" />}Refresh</Button>
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
                    return <div key={slice.id} className="grid min-w-0 gap-3 border-b px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-start">
                      <div className="min-w-0"><span className="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">Uncovered time</span><p className="break-words font-mono text-xs">{format(new Date(slice.start), "MMM d, h:mm a")} – {format(new Date(slice.end), "h:mm a")}</p>{wasTrimmed && <p className="break-words text-xs text-muted-foreground">From {format(new Date(slice.sourceStart), "h:mm a")} – {format(new Date(slice.sourceEnd), "h:mm a")} block</p>}</div>
                      <div className="min-w-0"><span className="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">Agent Time project</span><p className="break-words text-xs">{slice.interval.project}</p><p className="break-words text-xs text-muted-foreground">{slice.interval.agents.join(" + ") || "coding"}</p></div>
                      <div className="min-w-0"><span className="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">Imports to</span><p className="break-words text-xs sm:line-clamp-2" title={mappedProjectLabel}>{mappedProjectLabel}</p></div>
                      <div className="min-w-0 sm:text-right"><span className="mb-1 block text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground sm:hidden">Duration</span><p className="font-mono text-xs">{formatDuration(slice.durationSeconds)}</p></div>
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
