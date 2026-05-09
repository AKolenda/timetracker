"use client"

import { useState } from "react"
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderKanban,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/page-header"
import { useStore } from "@/lib/store"
import { formatCurrency, formatHours } from "@/lib/format"
import type { Project } from "@/lib/types"

const emptyForm = {
  clientId: "",
  name: "",
  rate: "",
  currency: "USD",
  status: "active" as Project["status"],
  color: "",
}

const PROJECT_COLORS = [
  "",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
]

const statusStyles: Record<Project["status"], string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  completed: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "on-hold": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
}

export default function ProjectsPage() {
  const {
    data,
    addProject,
    updateProject,
    deleteProject,
    getClient,
    getTimeEntriesByProject,
  } = useStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState(emptyForm)

  function openCreate() {
    setEditing(null)
    setForm({
      ...emptyForm,
      clientId: data.clients[0]?.id ?? "",
    })
    setDialogOpen(true)
  }

  function openEdit(project: Project) {
    setEditing(project)
    setForm({
      clientId: project.clientId,
      name: project.name,
      rate: project.rate.toString(),
      currency: project.currency,
      status: project.status,
      color: project.color ?? "",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Project name is required")
      return
    }
    if (!form.clientId) {
      toast.error("Please select a client")
      return
    }
    const payload = {
      clientId: form.clientId,
      name: form.name.trim(),
      rate: parseFloat(form.rate) || 0,
      currency: form.currency,
      status: form.status,
      color: form.color,
    }
    if (editing) {
      await updateProject(editing.id, payload)
      toast.success("Project updated")
    } else {
      await addProject(payload)
      toast.success("Project created")
    }
    setDialogOpen(false)
  }

  async function handleDelete(project: Project) {
    await deleteProject(project.id)
    toast.success("Project deleted")
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description="Track projects and hourly rates"
        actions={
          <Button
            size="sm"
            onClick={openCreate}
            disabled={data.clients.length === 0}
          >
            <Plus className="size-4" data-icon="inline-start" />
            New Project
          </Button>
        }
      />

      {data.clients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              Create a client first before adding projects
            </p>
          </CardContent>
        </Card>
      ) : data.projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <FolderKanban className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No projects yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first project to start tracking time
            </p>
            <Button size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="size-4" data-icon="inline-start" />
              New Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.projects.map((project) => {
                const client = getClient(project.clientId)
                const entries = getTimeEntriesByProject(project.id)
                const totalSecs = entries.reduce(
                  (s, e) => s + e.duration,
                  0
                )
                const billableSecs = entries
                  .filter((e) => e.billable)
                  .reduce((s, e) => s + e.duration, 0)
                const revenue = (billableSecs / 3600) * project.rate

                return (
                  <TableRow key={project.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="size-2 rounded-full"
                          style={{
                            backgroundColor:
                              project.color || client?.color || "transparent",
                          }}
                        />
                        <span className="font-medium">{project.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {client?.name ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatCurrency(project.rate, project.currency)}/hr
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatHours(totalSecs)}h
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatCurrency(revenue, project.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={statusStyles[project.status]}
                      >
                        {project.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => openEdit(project)}
                          >
                            <Pencil className="size-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(project)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Project" : "New Project"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Website Redesign"
              />
            </div>
            <div className="grid gap-2">
              <Label>Client</Label>
              <Select
                value={form.clientId}
                onValueChange={(v) => setForm({ ...form, clientId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {data.clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="rate">Hourly Rate</Label>
                <Input
                  id="rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                  placeholder="150.00"
                />
              </div>
              <div className="grid gap-2">
                <Label>Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm({ ...form, currency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="AUD">AUD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm({ ...form, status: v as Project["status"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="on-hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Color</Label>
              <div className="flex flex-wrap items-center gap-2">
                {PROJECT_COLORS.map((color) => {
                  const isClientFallback = color === ""
                  const fallbackClientColor = getClient(form.clientId)?.color
                  const display = isClientFallback
                    ? fallbackClientColor
                    : color
                  const selected = form.color === color
                  return (
                    <button
                      key={color || "client-default"}
                      type="button"
                      onClick={() => setForm({ ...form, color })}
                      title={isClientFallback ? "Use client color" : color}
                      className="relative size-7 rounded-md ring-2 ring-offset-2 ring-offset-background transition-all"
                      style={{
                        backgroundColor: display ?? "transparent",
                        backgroundImage: isClientFallback && !display
                          ? "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.2) 3px, rgba(255,255,255,0.2) 6px)"
                          : undefined,
                        ["--tw-ring-color" as string]: selected
                          ? display ?? "var(--foreground)"
                          : "transparent",
                      }}
                    >
                      {isClientFallback && (
                        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/80">
                          C
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">C</span> = inherit from client.
              </p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave}>
              {editing ? "Save Changes" : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
