"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog"
import { PageHeader } from "@/components/page-header"
import { ProjectStatusBadge, projectStatusLabels } from "@/components/status-badge"
import { useStore } from "@/lib/store"
import { useMoney } from "@/lib/display-currency"
import { formatHours } from "@/lib/format"
import { formatDistanceToNowStrict } from "date-fns"
import { billedSeconds } from "@/lib/billing"
import { agentFolderKey, dedupeAgentFolders, linkAgentFolders, suggestAgentFolders, type AgentFolderActivity } from "@/lib/agent-import-projects"
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
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<{ name?: string; clientId?: string }>({})
  const [mergeSource, setMergeSource] = useState<Project | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState("")
  const [folderQuery, setFolderQuery] = useState("")
  const [detectedFolders, setDetectedFolders] = useState<AgentFolderActivity[] | null>(null)

  // Folder names come from Agent Time; they're only fetched once a project dialog opens.
  useEffect(() => {
    if (!dialogOpen || detectedFolders) return
    let cancelled = false
    fetch(`/api/agent-time?foldersOnly=true${fixtureQuery()}`)
      .then((response) => (response.ok ? response.json() : { projects: [] }))
      .then((body: { folders?: unknown; projects?: unknown }) => {
        if (cancelled) return
        const folders = Array.isArray(body.folders)
          ? body.folders.filter((f): f is AgentFolderActivity => typeof f?.name === "string")
          : Array.isArray(body.projects)
            ? body.projects.filter((p): p is string => typeof p === "string").map((name) => ({ name, lastActive: "", seconds: 0 }))
            : []
        setDetectedFolders(folders)
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
    linkedElsewhere: new Set(folderOwners.keys()),
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
    setErrors({})
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
    setErrors({})
    setDialogOpen(true)
  }

  async function handleSave() {
    const nextErrors = {
      name: form.name.trim() ? undefined : "Enter a project name",
      clientId: form.clientId ? undefined : "Choose a client",
    }
    if (nextErrors.name || nextErrors.clientId) {
      setErrors(nextErrors)
      document.getElementById(nextErrors.name ? "project-name" : "project-client")?.focus()
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
    try {
      await deleteProject(project.id)
      toast.success("Project deleted")
    } catch {
      toast.error("Couldn't delete the project")
    }
    setDeleteTarget(null)
  }

  const deleteCounts = (() => {
    if (!deleteTarget) return null
    const entries = data.timeEntries.filter((t) => t.projectId === deleteTarget.id).length
    const expenses = data.expenses.filter((e) => e.projectId === deleteTarget.id).length
    return { entries, expenses }
  })()

  async function handleMerge() {
    if (!mergeSource || !mergeTargetId) return
    await mergeProject(mergeSource.id, mergeTargetId)
    toast.success("Project merged; entries and expenses were moved")
    setMergeSource(null)
    setMergeTargetId("")
  }

  const projectRows = data.projects.map((project) => {
    const entries = getTimeEntriesByProject(project.id)
    const totalSecs = entries.reduce((s, e) => s + e.duration, 0)
    const billableSecs = entries
      .filter((e) => e.billable)
      .reduce((s, e) => s + billedSeconds(e), 0)
    return {
      project,
      client: getClient(project.clientId),
      totalSecs,
      revenue: (billableSecs / 3600) * project.rate,
    }
  })

  function actionsMenu(project: Project) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${project.name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openEdit(project)}>
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
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(project)}>
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <>
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? "project"}?`}
        description={
          <>
            This also deletes its {deleteCounts?.entries ?? 0} time {deleteCounts?.entries === 1 ? "entry" : "entries"} and{" "}
            {deleteCounts?.expenses ?? 0} {deleteCounts?.expenses === 1 ? "expense" : "expenses"}. This can&apos;t be undone. To keep the
            history, set the project to Completed instead.
          </>
        }
        confirmLabel="Delete project"
        onConfirm={() => (deleteTarget ? handleDelete(deleteTarget) : undefined)}
      />
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
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <FolderKanban className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Add a client first</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every project belongs to a client.
            </p>
            <Button size="sm" variant="outline" className="mt-4" asChild>
              <Link href="/clients">Go to Clients</Link>
            </Button>
          </CardContent>
        </Card>
      ) : data.projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
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
        <Card className="py-0">
          <ul className="divide-y lg:hidden" aria-label="Projects">
            {projectRows.map(({ project, client, totalSecs, revenue }) => (
              <li key={project.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{project.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{client?.name ?? "No client"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
                    <ProjectStatusBadge status={project.status} />
                    <span>{money(project.rate, project.currency)}/hr</span>
                    <span aria-hidden>·</span>
                    <span>{formatHours(totalSecs)}h</span>
                    <span aria-hidden>·</span>
                    <span className="font-medium text-foreground">{money(revenue, project.currency)}</span>
                  </div>
                  {!!project.agentFolders?.length && (
                    <p className="mt-1 truncate text-xs text-muted-foreground" title="Agent Time from these folders imports here">
                      Agent folders: {project.agentFolders.join(", ")}
                    </p>
                  )}
                </div>
                <div className="-mr-1.5 -mt-0.5 shrink-0">{actionsMenu(project)}</div>
              </li>
            ))}
          </ul>
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12 pr-4"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectRows.map(({ project, client, totalSecs, revenue }) => (
                  <TableRow key={project.id}>
                    <TableCell className="pl-4">
                      <span className="font-medium">{project.name}</span>
                      {!!project.agentFolders?.length && (
                        <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground" title={`Agent Time from these folders imports here: ${project.agentFolders.join(", ")}`}>
                          Agent folders: {project.agentFolders.join(", ")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {client?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(project.rate, project.currency)}/hr
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatHours(totalSecs)}h
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money(revenue, project.currency)}
                    </TableCell>
                    <TableCell>
                      <ProjectStatusBadge status={project.status} />
                    </TableCell>
                    <TableCell className="pr-4 text-right">{actionsMenu(project)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Project" : "New Project"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value })
                  setErrors((current) => ({ ...current, name: undefined }))
                }}
                placeholder="Website Redesign"
                aria-invalid={!!errors.name || undefined}
                aria-describedby={errors.name ? "project-name-error" : undefined}
              />
              {errors.name && (
                <p id="project-name-error" className="text-xs text-destructive">
                  {errors.name}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-client">Client</Label>
              <Select
                value={form.clientId}
                onValueChange={(v) => {
                  setForm({ ...form, clientId: v })
                  setErrors((current) => ({ ...current, clientId: undefined }))
                }}
              >
                <SelectTrigger
                  id="project-client"
                  className="w-full"
                  aria-invalid={!!errors.clientId || undefined}
                  aria-describedby={errors.clientId ? "project-client-error" : undefined}
                >
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
              {errors.clientId && (
                <p id="project-client-error" className="text-xs text-destructive">
                  {errors.clientId}
                </p>
              )}
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
                <Label htmlFor="project-currency">Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(v) => setForm({ ...form, currency: v })}
                >
                  <SelectTrigger id="project-currency" className="w-full">
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
              <Label htmlFor="project-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm({ ...form, status: v as Project["status"] })
                }
              >
                <SelectTrigger id="project-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(projectStatusLabels) as Project["status"][]).map((status) => (
                    <SelectItem key={status} value={status}>{projectStatusLabels[status]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="agent-folder">Agent folders</Label>
              <p className="-mt-1 text-xs text-muted-foreground">
                Agent time from these folders imports into this project. Names match in any case.
              </p>
              {form.agentFolders.length > 0 && (
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto" data-testid="agent-folders">
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
              {detectedFolders === null ? (
                <p className="text-xs text-muted-foreground">Looking for folders in Agent Time…</p>
              ) : folderSuggestions.length > 0 ? (
                <div className="grid gap-1.5" data-testid="agent-folder-suggestions">
                  <p className="text-xs text-muted-foreground">{folderQuery.trim() ? "Matching folders" : "Suggested folders"}</p>
                  <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto p-0.5">
                    {folderSuggestions.map((folder) => {
                      const owner = folderOwners.get(agentFolderKey(folder.name))
                      const lastActive = folder.lastActive ? new Date(folder.lastActive) : null
                      return (
                        <Button
                          key={folder.name}
                          type="button"
                          variant="outline"
                          size="xs"
                          className="h-auto max-w-full py-1 font-normal"
                          title={lastActive ? `Last agent activity ${lastActive.toLocaleString()}` : "No agent activity recorded yet"}
                          onClick={() => addFolder(folder.name)}
                        >
                          <Plus className="size-3 shrink-0" data-icon="inline-start" />
                          <span className="truncate">{folder.name}</span>
                          {folder.seconds > 0 && <span className="shrink-0 text-muted-foreground">· {formatHours(folder.seconds)}h</span>}
                          {lastActive && !Number.isNaN(+lastActive) && (
                            <span className="shrink-0 text-muted-foreground">· {formatDistanceToNowStrict(lastActive, { addSuffix: true })}</span>
                          )}
                          {owner && <span className="shrink-0 text-muted-foreground">· on {owner.name}</span>}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {folderQuery.trim()
                    ? "No folder by that name in Agent Time yet. Add still links it, so its time imports once it shows up."
                    : "No other folders in Agent Time. Type a name to link one before it shows up."}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="sticky -bottom-4 bg-popover">
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
          <div className="grid gap-2 py-2"><Label htmlFor="merge-target">Merge into</Label><Select value={mergeTargetId} onValueChange={setMergeTargetId}><SelectTrigger id="merge-target" className="w-full"><SelectValue placeholder="Choose a project" /></SelectTrigger><SelectContent>{data.projects.filter((project) => project.id !== mergeSource?.id && project.clientId === mergeSource?.clientId).map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>
          <DialogFooter><Button variant="outline" onClick={() => setMergeSource(null)}>Cancel</Button><Button disabled={!mergeTargetId} onClick={handleMerge}>Merge projects</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
