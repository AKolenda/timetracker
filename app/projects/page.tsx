"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Plus,
  X,
  MoreHorizontal,
  Pencil,
  Trash2,
  Merge,
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
import { useMoney } from "@/lib/display-currency"
import { formatHours } from "@/lib/format"
import { billedSeconds } from "@/lib/billing"
import { agentFolderKey, dedupeAgentFolders, linkAgentFolders, suggestAgentFolders } from "@/lib/agent-import-projects"
import type { Project } from "@/lib/types"

const emptyForm = {
  clientId: "",
  name: "",
  rate: "",
  currency: "USD",
  status: "active" as Project["status"],
  agentFolders: [] as string[],
}

function fixtureQuery() {
  if (process.env.NEXT_PUBLIC_E2E_FIXTURES !== "true" || typeof window === "undefined") return ""
  const fixture = new URLSearchParams(window.location.search).get("fixture")
  return fixture === "demo" || fixture === "mobile" ? `&fixture=${fixture}` : ""
}

const statusStyles: Record<Project["status"], string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  completed: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "on-hold": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
}

export default function ProjectsPage() {
  const { money } = useMoney()
  const {
    data,
    addProject,
    updateProject,
    mergeProject,
    deleteProject,
    getClient,
    getTimeEntriesByProject,
  } = useStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [mergeSource, setMergeSource] = useState<Project | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState("")
  const [folderQuery, setFolderQuery] = useState("")
  const [detectedFolders, setDetectedFolders] = useState<string[] | null>(null)

  // Folder names come from Agent Time; they're only fetched once a project dialog opens.
  useEffect(() => {
    if (!dialogOpen || detectedFolders) return
    let cancelled = false
    fetch(`/api/agent-time?foldersOnly=true${fixtureQuery()}`)
      .then((response) => (response.ok ? response.json() : { projects: [] }))
      .then((body: { projects?: unknown }) => {
        if (!cancelled) setDetectedFolders(Array.isArray(body.projects) ? body.projects.filter((p): p is string => typeof p === "string") : [])
      })
      .catch(() => {
        if (!cancelled) setDetectedFolders([])
      })
    return () => {
      cancelled = true
    }
  }, [dialogOpen, detectedFolders])

  const folderOwners = useMemo(() => {
    const owners = new Map<string, Project>()
    for (const project of data.projects) {
      if (project.id === editing?.id) continue
      for (const folder of project.agentFolders ?? []) owners.set(agentFolderKey(folder), project)
    }
    return owners
  }, [data.projects, editing])

  const folderSuggestions = suggestAgentFolders(detectedFolders ?? [], {
    projectName: form.name,
    query: folderQuery,
    linked: form.agentFolders,
  })

  function addFolder(folder: string) {
    if (!folder.trim()) return
    setForm((current) => ({ ...current, agentFolders: dedupeAgentFolders([...current.agentFolders, folder]) }))
    setFolderQuery("")
  }

  function removeFolder(folder: string) {
    setForm((current) => ({ ...current, agentFolders: current.agentFolders.filter((f) => f !== folder) }))
  }

  function openCreate() {
    setEditing(null)
    setForm({
      ...emptyForm,
      clientId: data.clients[0]?.id ?? "",
    })
    setFolderQuery("")
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
      agentFolders: project.agentFolders ?? [],
    })
    setFolderQuery("")
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
    // A folder typed but not yet added still counts.
    const agentFolders = dedupeAgentFolders([...form.agentFolders, folderQuery])
    const payload = {
      clientId: form.clientId,
      name: form.name.trim(),
      rate: parseFloat(form.rate) || 0,
      currency: form.currency,
      status: form.status,
      color: "",
    }
    const foldersChanged =
      agentFolders.join("\n") !== (editing?.agentFolders ?? []).join("\n")
    try {
      let projectId = editing?.id
      if (editing) {
        // Folders are only written when they change, so other edits work before migration 014.
        await updateProject(editing.id, foldersChanged ? { ...payload, agentFolders } : payload)
      } else {
        projectId = (await addProject({ ...payload, agentFolders })).id
      }
      // A folder imports into one project only, so take it off any project that had it.
      if (foldersChanged) {
        for (const change of linkAgentFolders(data.projects.filter((p) => p.id !== projectId), projectId ?? null, agentFolders)) {
          await updateProject(change.id, { agentFolders: change.agentFolders })
        }
      }
      toast.success(editing ? "Project updated" : "Project created")
      setDialogOpen(false)
    } catch {
      toast.error(foldersChanged ? "Couldn't save agent folders. Has migration 014 been applied?" : "Couldn't save the project")
    }
  }

  async function handleDelete(project: Project) {
    await deleteProject(project.id)
    toast.success("Project deleted")
  }

  async function handleMerge() {
    if (!mergeSource || !mergeTargetId) return
    await mergeProject(mergeSource.id, mergeTargetId)
    toast.success("Project merged; entries and expenses were moved")
    setMergeSource(null)
    setMergeTargetId("")
  }

  return (
    <>
      <PageHeader
        title="Projects"
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
                  .reduce((s, e) => s + billedSeconds(e), 0)
                const revenue = (billableSecs / 3600) * project.rate

                return (
                  <TableRow key={project.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{project.name}</span>
                      </div>
                      {!!project.agentFolders?.length && (
                        <p className="mt-0.5 text-xs text-muted-foreground" title="Agent Time from these folders imports here">
                          Agent folders: {project.agentFolders.join(", ")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {client?.name ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {money(project.rate, project.currency)}/hr
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatHours(totalSecs)}h
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {money(revenue, project.currency)}
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
                            onClick={() => {
                              setMergeSource(project)
                              setMergeTargetId("")
                            }}
                          >
                            <Merge className="size-4" />
                            Merge into…
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
              <Label htmlFor="agent-folder">Agent folders</Label>
              <p className="-mt-1 text-xs text-muted-foreground">
                Agent time from these folders imports into this project. Names match in any case.
              </p>
              {form.agentFolders.length > 0 && (
                <div className="flex flex-wrap gap-1.5" data-testid="agent-folders">
                  {form.agentFolders.map((folder) => {
                    const owner = folderOwners.get(agentFolderKey(folder))
                    return (
                      <span key={folder} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/50 py-0.5 pl-2 pr-0.5 text-xs">
                        <span className="truncate">{folder}</span>
                        {owner && <span className="shrink-0 text-muted-foreground">· moves from {owner.name}</span>}
                        <Button type="button" variant="ghost" size="icon-xs" className="size-5" aria-label={`Remove ${folder}`} onClick={() => removeFolder(folder)}>
                          <X className="size-3" />
                        </Button>
                      </span>
                    )
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  id="agent-folder"
                  value={folderQuery}
                  onChange={(e) => setFolderQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addFolder(folderQuery)
                    }
                  }}
                  placeholder="Folder name"
                  autoComplete="off"
                />
                <Button type="button" variant="outline" onClick={() => addFolder(folderQuery)} disabled={!folderQuery.trim()}>
                  Add
                </Button>
              </div>
              {folderSuggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{folderQuery.trim() ? "Matching folders:" : "Found in Agent Time:"}</span>
                  {folderSuggestions.map((folder) => {
                    const owner = folderOwners.get(agentFolderKey(folder))
                    return (
                      <Button key={folder} type="button" variant="outline" size="xs" className="font-normal" onClick={() => addFolder(folder)}>
                        <Plus className="size-3" data-icon="inline-start" />
                        {folder}
                        {owner && <span className="text-muted-foreground">({owner.name})</span>}
                      </Button>
                    )
                  })}
                </div>
              )}
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

      <Dialog open={!!mergeSource} onOpenChange={(open) => !open && setMergeSource(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Merge project</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Move all time entries and expenses from <span className="font-medium text-foreground">{mergeSource?.name}</span> into another project. The original project will be removed.</p>
          <div className="grid gap-2 py-2"><Label>Merge into</Label><Select value={mergeTargetId} onValueChange={setMergeTargetId}><SelectTrigger><SelectValue placeholder="Choose a project" /></SelectTrigger><SelectContent>{data.projects.filter((project) => project.id !== mergeSource?.id && project.clientId === mergeSource?.clientId).map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>
          <DialogFooter><Button variant="outline" onClick={() => setMergeSource(null)}>Cancel</Button><Button disabled={!mergeTargetId} onClick={handleMerge}>Merge projects</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
