"use client"

import { useEffect, useMemo, useState } from "react"
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
import { PageHeader } from "@/components/page-header"
import { useStore } from "@/lib/store"
import { formatCurrency, formatDuration, formatHours } from "@/lib/format"
import { localDateString, parseLocalDate } from "@/lib/datetime"
import type { TimeEntry } from "@/lib/types"

type AgentTimeInterval = {
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

type TimeRange = { start: number; end: number }

function subtractRanges(source: TimeRange, occupied: TimeRange[]) {
  let cursor = source.start
  const uncovered: TimeRange[] = []
  for (const range of [...occupied].sort((a, b) => a.start - b.start)) {
    if (range.end <= cursor || range.start >= source.end) continue
    if (range.start > cursor) uncovered.push({ start: cursor, end: Math.min(range.start, source.end) })
    cursor = Math.max(cursor, range.end)
    if (cursor >= source.end) break
  }
  if (cursor < source.end) uncovered.push({ start: cursor, end: source.end })
  return uncovered.filter((range) => range.end > range.start)
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
  const [projectMappings, setProjectMappings] = useState<Record<string, string>>({})

  const activeTimer = data.activeTimer

  useEffect(() => {
    try {
      const saved = localStorage.getItem("timetracker-agent-time-project-mappings")
      if (saved) setProjectMappings(JSON.parse(saved))
    } catch {
      // Mapping is a convenience only; a malformed saved value should not block importing.
    }
  }, [])

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

  async function loadAgentTime(silent = false) {
    setAgentTimeLoading(true)
    try {
      const gap = Math.max(0, Number(gapMinutes) || 15)
      const response = await fetch(`/api/agent-time?gapMinutes=${gap}`)
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
    const selected = agentTime.intervals.filter((interval) =>
      agentProjectFilter === "all" || interval.project === agentProjectFilter
    )
    const missing = [...new Set(selected.map((interval) => interval.project))]
      .filter((project) => !projectMappings[project])
    if (missing.length) {
      toast.error(`Choose a TimeTracker project for ${missing.join(", ")}`)
      return
    }

    const occupiedByProject = new Map<string, TimeRange[]>()
    for (const entry of data.timeEntries) {
      if (!entry.startTime || !entry.endTime) continue
      const start = new Date(entry.startTime).getTime()
      const end = new Date(entry.endTime).getTime()
      if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
        const ranges = occupiedByProject.get(entry.projectId) ?? []
        ranges.push({ start, end })
        occupiedByProject.set(entry.projectId, ranges)
      }
    }

    let imported = 0
    let skippedSeconds = 0
    for (const interval of [...selected].sort((a, b) => +new Date(a.start) - +new Date(b.start))) {
      const projectId = projectMappings[interval.project]
      const start = new Date(interval.start).getTime()
      const end = new Date(interval.end).getTime()
      if (!projectId || Number.isNaN(start) || Number.isNaN(end) || end <= start) continue
      const occupied = occupiedByProject.get(projectId) ?? []
      const gaps = subtractRanges({ start, end }, occupied)
      skippedSeconds += Math.floor((end - start) / 1000) - gaps.reduce((total, gap) => total + Math.floor((gap.end - gap.start) / 1000), 0)
      for (const gap of gaps) {
        const gapStart = new Date(gap.start)
        const gapEnd = new Date(gap.end)
        await addTimeEntry({
          projectId,
          description: `Agent Time — ${interval.agents.join(" + ") || "coding"}`,
          startTime: gapStart.toISOString(),
          endTime: gapEnd.toISOString(),
          duration: Math.floor((gap.end - gap.start) / 1000),
          billable: true,
          date: localDateString(gapStart, data.settings.timezone),
        })
        occupied.push(gap)
        imported++
      }
      occupiedByProject.set(projectId, occupied)
    }
    toast.success(imported ? `Imported ${imported} uncovered ${imported === 1 ? "entry" : "entries"}` : "Everything was already tracked")
    if (skippedSeconds > 0) toast(`Skipped ${formatDuration(skippedSeconds)} already tracked`)
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
      projectId: timerProject,
      description: timerDesc,
      startTime: new Date().toISOString(),
      billable: timerBillable,
    })
    toast.success("Timer started")
  }

  async function handleStop() {
    const entry = await stopTimer()
    if (entry) {
      toast.success(`Tracked ${formatHours(entry.duration)}h`)
    }
    setTimerDesc("")
  }

  function handleDiscard() {
    clearTimer()
    toast("Timer discarded")
  }

  function handleResume(entry: TimeEntry) {
    if (activeTimer) {
      toast.error("Stop the running timer first")
      return
    }
    const project = getProject(entry.projectId)
    if (!project || project.status !== "active") {
      toast.error("Project is not active")
      return
    }
    startTimer({
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
    toast.success(`Resumed: ${entry.description || project.name}`)
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

  const unimportedAgentTime = useMemo(() => {
    if (!agentTime) return { seconds: 0, blocks: 0, unmappedProjects: [] as string[] }

    const occupiedByProject = new Map<string, TimeRange[]>()
    for (const entry of data.timeEntries) {
      if (!entry.startTime || !entry.endTime) continue
      const start = new Date(entry.startTime).getTime()
      const end = new Date(entry.endTime).getTime()
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue
      const occupied = occupiedByProject.get(entry.projectId) ?? []
      occupied.push({ start, end })
      occupiedByProject.set(entry.projectId, occupied)
    }

    let seconds = 0
    let blocks = 0
    const unmappedProjects = new Set<string>()
    for (const interval of agentTime.intervals) {
      const start = new Date(interval.start).getTime()
      const end = new Date(interval.end).getTime()
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue
      const projectId = projectMappings[interval.project]
      if (!projectId) {
        seconds += Math.floor((end - start) / 1000)
        blocks++
        unmappedProjects.add(interval.project)
        continue
      }
      const gaps = subtractRanges({ start, end }, occupiedByProject.get(projectId) ?? [])
      const uncovered = gaps.reduce((total, gap) => total + Math.floor((gap.end - gap.start) / 1000), 0)
      if (uncovered > 0) {
        seconds += uncovered
        blocks++
      }
    }

    return { seconds, blocks, unmappedProjects: [...unmappedProjects].sort() }
  }, [agentTime, data.timeEntries, projectMappings])

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
              <div className="flex min-w-0 items-center gap-3">
                <Input
                  placeholder="What are you working on?"
                  value={activeTimer ? activeTimer.description : timerDesc}
                  onChange={(e) => {
                    if (!activeTimer) setTimerDesc(e.target.value)
                  }}
                  disabled={!!activeTimer}
                  className="h-10 min-w-0 flex-1"
                />
                <Select
                  value={activeTimer ? activeTimer.projectId : timerProject}
                  onValueChange={(v) => {
                    if (!activeTimer) setTimerProject(v)
                  }}
                  disabled={!!activeTimer}
                >
                  <SelectTrigger className="data-[size=default]:h-10 w-[200px] shrink-0">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.projects
                      .filter((p) => p.status === "active")
                      .map((p) => {
                        return (
                          <SelectItem key={p.id} value={p.id}>
                            <div className="flex items-center gap-2">
                              {p.name}
                            </div>
                          </SelectItem>
                        )
                      })}
                  </SelectContent>
                </Select>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Checkbox
                    id="timer-billable"
                    checked={
                      activeTimer ? activeTimer.billable : timerBillable
                    }
                    onCheckedChange={(v) => {
                      if (!activeTimer) setTimerBillable(v === true)
                    }}
                    disabled={!!activeTimer}
                  />
                  <Label
                    htmlFor="timer-billable"
                    className="text-xs text-muted-foreground"
                  >
                    Billable
                  </Label>
                </div>
              </div>

              <div className="flex items-center gap-4 rounded-lg border bg-muted/30 px-4 py-3">
                <Clock className="size-5 shrink-0 text-muted-foreground" />
                {activeTimer ? (
                  <LiveTimer
                    startTime={activeTimer.startTime}
                    pausedAt={activeTimer.pausedAt}
                    accumulatedPause={activeTimer.accumulatedPause}
                  />
                ) : (
                  <span className="font-mono text-3xl font-bold tabular-nums tracking-tight text-muted-foreground">
                    00:00:00
                  </span>
                )}
                {activeTimer?.pausedAt && (
                  <Badge variant="secondary" className="animate-pulse text-xs">
                    Paused
                  </Badge>
                )}
                <div className="ml-auto flex gap-2">
                  {activeTimer ? (
                    <>
                      <Button variant="outline" onClick={handleDiscard}>
                        Discard
                      </Button>
                      {activeTimer.pausedAt ? (
                        <Button
                          onClick={resumeTimer}
                          className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                        >
                          <Play className="size-3.5" data-icon="inline-start" />
                          Resume
                        </Button>
                      ) : (
                        <Button
                          onClick={pauseTimer}
                          variant="outline"
                        >
                          <Pause className="size-3.5" data-icon="inline-start" />
                          Pause
                        </Button>
                      )}
                      <Button
                        onClick={handleStop}
                        className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600"
                      >
                        <Square className="size-3.5" data-icon="inline-start" />
                        Stop
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={handleStart}
                      className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
                    >
                      <Play className="size-3.5" data-icon="inline-start" />
                      Start
                    </Button>
                  )}
                </div>
              </div>
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
                  {unimportedAgentTime.unmappedProjects.length > 0 && ` Map ${unimportedAgentTime.unmappedProjects.join(", ")} to a client project before importing.`}
                </p>
              </div>
            </div>
            <Button variant="outline" className="shrink-0" onClick={openAgentTimeImport}>
              <Download className="size-3.5" data-icon="inline-start" />
              Review and import
            </Button>
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
              {sortedEntries.map((entry) => {
                const project = getProject(entry.projectId)
                const amount = entry.billable && project ? (entry.duration / 3600) * project.rate : 0
                return <TableRow key={entry.id}>
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
                    <Button variant="ghost" size="icon-xs" onClick={() => handleResume(entry)} disabled={!!activeTimer}><Play className="size-3.5 fill-current" /></Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => openEdit(entry)}><Pencil className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(entry)}><Trash2 className="size-3.5" /></Button>
                  </div></TableCell>
                </TableRow>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Agent Time</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <p className="text-sm text-muted-foreground">Agent Time stays running in the background. Map its project names once, then import only time that does not overlap existing timed entries.</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="grid flex-1 gap-2"><Label htmlFor="agent-gap">Join gaps up to (minutes)</Label><Input id="agent-gap" type="number" min="0" max="240" value={gapMinutes} onChange={(event) => setGapMinutes(event.target.value)} /></div>
              <Button variant="outline" onClick={() => void loadAgentTime()} disabled={agentTimeLoading}>{agentTimeLoading && <LoaderCircle className="size-3.5 animate-spin" data-icon="inline-start" />}Refresh</Button>
            </div>
            {agentTime && <>
              <div className="grid gap-2"><Label>Agent Time project to show</Label><Select value={agentProjectFilter} onValueChange={setAgentProjectFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All projects ({agentTime.intervals.length} intervals)</SelectItem>{agentTime.projects.map((project) => <SelectItem key={project} value={project}>{project}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-3 rounded-xl border p-3">
                {[...new Set(agentTime.intervals.filter((interval) => agentProjectFilter === "all" || interval.project === agentProjectFilter).map((interval) => interval.project))].map((agentProject) => <div key={agentProject} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center"><p className="truncate text-sm font-medium" title={agentProject}>{agentProject}</p><Select value={projectMappings[agentProject] ?? ""} onValueChange={(projectId) => saveProjectMapping(agentProject, projectId)}><SelectTrigger><SelectValue placeholder="Map to client / project" /></SelectTrigger><SelectContent>{data.projects.map((project) => <SelectItem key={project.id} value={project.id}>{getClient(project.clientId)?.name ? `${getClient(project.clientId)?.name} — ${project.name}` : project.name}</SelectItem>)}</SelectContent></Select></div>)}
              </div>
              <p className="text-xs text-muted-foreground">{agentTime.intervals.filter((interval) => agentProjectFilter === "all" || interval.project === agentProjectFilter).length} intervals ready. Existing time entries with exact times are automatically excluded.</p>
            </>}
            {!agentTime && !agentTimeLoading && <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">Load Agent Time to choose projects and review available intervals.</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button><Button onClick={() => void importAgentTime()} disabled={!agentTime || agentTimeLoading}>Import uncovered hours</Button></DialogFooter>
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
