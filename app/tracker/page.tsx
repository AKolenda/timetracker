"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Play,
  Square,
  Plus,
  Trash2,
  Pencil,
  Clock,
  CalendarIcon,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { PageHeader } from "@/components/page-header"
import { useStore } from "@/lib/store"
import { formatCurrency, formatDuration, formatHours } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { TimeEntry } from "@/lib/types"

function LiveTimer({ startTime }: { startTime: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    function tick() {
      setElapsed(
        Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startTime])

  return (
    <span className="font-mono text-3xl font-bold tabular-nums tracking-tight">
      {formatDuration(elapsed)}
    </span>
  )
}

const emptyManual = {
  projectId: "",
  description: "",
  hours: "",
  minutes: "",
  billable: true,
  date: new Date(),
}


export default function TrackerPage() {
  const {
    data,
    startTimer,
    stopTimer,
    clearTimer,
    addTimeEntry,
    updateTimeEntry,
    deleteTimeEntry,
    getClient,
    getProject,
  } = useStore()

  const [timerProject, setTimerProject] = useState("")
  const [timerDesc, setTimerDesc] = useState("")
  const [timerBillable, setTimerBillable] = useState(true)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualForm, setManualForm] = useState(emptyManual)

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

  const activeTimer = data.activeTimer

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
    setTimerProject(entry.projectId)
    setTimerDesc(entry.description)
    setTimerBillable(entry.billable)
    toast.success(`Resumed: ${entry.description || project.name}`)
  }

  async function handleManualSave() {
    if (!manualForm.projectId) {
      toast.error("Select a project")
      return
    }
    const hours = parseInt(manualForm.hours) || 0
    const minutes = parseInt(manualForm.minutes) || 0
    const duration = hours * 3600 + minutes * 60
    if (duration <= 0) {
      toast.error("Duration must be greater than 0")
      return
    }
    const dateStr = format(manualForm.date, "yyyy-MM-dd")
    await addTimeEntry({
      projectId: manualForm.projectId,
      description: manualForm.description,
      startTime: new Date(`${dateStr}T09:00:00`).toISOString(),
      endTime: new Date(
        new Date(`${dateStr}T09:00:00`).getTime() + duration * 1000
      ).toISOString(),
      duration,
      billable: manualForm.billable,
      date: dateStr,
    })
    toast.success("Time entry added")
    setManualOpen(false)
    setManualForm(emptyManual)
  }

  function openEdit(entry: TimeEntry) {
    setEditEntry(entry)
    setEditForm({
      description: entry.description,
      projectId: entry.projectId,
      startTime: entry.startTime || "",
      endTime: entry.endTime || "",
      billable: entry.billable,
      date: new Date(entry.date),
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
    const dateStr = format(editForm.date, "yyyy-MM-dd")

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
    () =>
      [...data.timeEntries].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    [data.timeEntries]
  )

  return (
    <>
      <PageHeader
        title="Time Tracker"
        description="Track and log your working hours"
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setManualForm({
                ...emptyManual,
                projectId: data.projects[0]?.id ?? "",
              })
              setManualOpen(true)
            }}
            disabled={data.projects.length === 0}
          >
            <Plus className="size-4" data-icon="inline-start" />
            Manual Entry
          </Button>
        }
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
                        const client = getClient(p.clientId)
                        return (
                          <SelectItem key={p.id} value={p.id}>
                            <div className="flex items-center gap-2">
                              {client && (
                                <div
                                  className="size-2 rounded-full"
                                  style={{ backgroundColor: client.color }}
                                />
                              )}
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
                  <LiveTimer startTime={activeTimer.startTime} />
                ) : (
                  <span className="font-mono text-3xl font-bold tabular-nums tracking-tight text-muted-foreground">
                    00:00:00
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  {activeTimer ? (
                    <>
                      <Button variant="outline" onClick={handleDiscard}>
                        Discard
                      </Button>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Time Log</CardTitle>
        </CardHeader>
        {sortedEntries.length === 0 ? (
          <CardContent>
            <p className="py-8 text-center text-sm text-muted-foreground">
              No time entries yet
            </p>
          </CardContent>
        ) : (
          <CardContent className="pb-4">
            <div className="overflow-hidden rounded-lg border">
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
                const client = project
                  ? getClient(project.clientId)
                  : undefined
                const amount =
                  entry.billable && project
                    ? (entry.duration / 3600) * project.rate
                    : 0

                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {entry.description || "Untitled"}
                        </span>
                        {entry.billable && (
                          <Badge
                            variant="secondary"
                            className="bg-emerald-500/10 font-mono text-[10px] text-emerald-600 dark:text-emerald-400"
                          >
                            $
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {client && (
                          <div
                            className="size-2 rounded-full"
                            style={{ backgroundColor: client.color }}
                          />
                        )}
                        <span className="text-xs">
                          {project?.name ?? "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {format(new Date(entry.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatDuration(entry.duration)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {amount > 0
                        ? formatCurrency(amount, project?.currency)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleResume(entry)}
                          disabled={!!activeTimer}
                          title={
                            activeTimer
                              ? "Stop the running timer first"
                              : "Resume this work"
                          }
                        >
                          <Play className="size-3.5 fill-current" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => openEdit(entry)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setDeleteTarget(entry)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Manual Entry Dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual Time Entry</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Project</Label>
              <Select
                value={manualForm.projectId}
                onValueChange={(v) =>
                  setManualForm({ ...manualForm, projectId: v })
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
              <Label htmlFor="manual-desc">Description</Label>
              <Input
                id="manual-desc"
                value={manualForm.description}
                onChange={(e) =>
                  setManualForm({
                    ...manualForm,
                    description: e.target.value,
                  })
                }
                placeholder="What did you work on?"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="manual-hours">Hours</Label>
                <Input
                  id="manual-hours"
                  type="number"
                  min="0"
                  value={manualForm.hours}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, hours: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="manual-minutes">Minutes</Label>
                <Input
                  id="manual-minutes"
                  type="number"
                  min="0"
                  max="59"
                  value={manualForm.minutes}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, minutes: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !manualForm.date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="size-4" data-icon="inline-start" />
                    {manualForm.date
                      ? format(manualForm.date, "PPP")
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={manualForm.date}
                    onSelect={(d) =>
                      d && setManualForm({ ...manualForm, date: d })
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="manual-billable"
                checked={manualForm.billable}
                onCheckedChange={(v) =>
                  setManualForm({ ...manualForm, billable: v === true })
                }
              />
              <Label htmlFor="manual-billable" className="text-sm">
                Billable
              </Label>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleManualSave}>Add Entry</Button>
          </DialogFooter>
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
            <div className="grid gap-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !editForm.date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="size-4" data-icon="inline-start" />
                    {editForm.date
                      ? format(editForm.date, "PPP")
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editForm.date}
                    onSelect={(d) =>
                      d && setEditForm({ ...editForm, date: d })
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
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
