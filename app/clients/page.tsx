"use client"

import { useState } from "react"
import { Plus, MoreHorizontal, Pencil, Trash2, FolderKanban } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PageHeader } from "@/components/page-header"
import { useStore } from "@/lib/store"
import type { Client } from "@/lib/types"

const CLIENT_COLORS = [
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

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  address: "",
  color: CLIENT_COLORS[0],
  invoiceEmail: "",
  invoiceScheduleWeeks: "" as string,
  invoiceScheduleEnabled: false,
  invoiceScheduleAnchor: "" as string,
  invoiceScheduleAutoSend: true,
}

export default function ClientsPage() {
  const { data, addClient, updateClient, deleteClient, getProjectsByClient } =
    useStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState(emptyForm)

  function openCreate() {
    setEditing(null)
    setForm({ ...emptyForm, color: CLIENT_COLORS[Math.floor(Math.random() * CLIENT_COLORS.length)] })
    setDialogOpen(true)
  }

  function openEdit(client: Client) {
    setEditing(client)
    setForm({
      name: client.name,
      email: client.email,
      phone: client.phone,
      address: client.address,
      color: client.color,
      invoiceEmail: client.invoiceEmail ?? "",
      invoiceScheduleWeeks: client.invoiceScheduleWeeks?.toString() ?? "",
      invoiceScheduleEnabled: client.invoiceScheduleEnabled ?? false,
      invoiceScheduleAnchor: client.invoiceScheduleAnchor ?? "",
      invoiceScheduleAutoSend: client.invoiceScheduleAutoSend ?? true,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Client name is required")
      return
    }
    const payload = {
      name: form.name.trim(),
      email: form.email,
      phone: form.phone,
      address: form.address,
      color: form.color,
      invoiceEmail: form.invoiceEmail,
      invoiceScheduleWeeks: form.invoiceScheduleWeeks
        ? parseInt(form.invoiceScheduleWeeks)
        : null,
      invoiceScheduleAnchor: form.invoiceScheduleAnchor || null,
      invoiceScheduleEnabled: form.invoiceScheduleEnabled,
      invoiceScheduleAutoSend: form.invoiceScheduleAutoSend,
      lastInvoiceSent: null as string | null,
    }
    if (editing) {
      await updateClient(editing.id, payload)
      toast.success("Client updated")
    } else {
      await addClient(payload)
      toast.success("Client created")
    }
    setDialogOpen(false)
  }

  async function handleDelete(client: Client) {
    await deleteClient(client.id)
    toast.success("Client deleted")
  }

  return (
    <>
      <PageHeader
        title="Clients"
        description="Manage your client relationships"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" data-icon="inline-start" />
            New Client
          </Button>
        }
      />

      {data.clients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <FolderKanban className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No clients yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first client to get started
            </p>
            <Button size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="size-4" data-icon="inline-start" />
              New Client
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.clients.map((client) => {
            const projects = getProjectsByClient(client.id)
            return (
              <Card key={client.id} className="relative">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="size-9 shrink-0 rounded-lg"
                        style={{ backgroundColor: client.color }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {client.name}
                        </p>
                        {client.email && (
                          <p className="truncate text-xs text-muted-foreground">
                            {client.email}
                          </p>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(client)}>
                          <Pencil className="size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(client)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-4 flex items-center gap-4 border-t pt-3 font-mono text-xs text-muted-foreground">
                    <span>{projects.length} projects</span>
                    {client.phone && <span>{client.phone}</span>}
                  </div>
                  {client.invoiceScheduleEnabled && client.invoiceScheduleWeeks ? (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Auto-invoice every {client.invoiceScheduleWeeks}w
                      {!client.invoiceScheduleAutoSend && " (draft only)"}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Client" : "New Client"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Acme Corporation"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="contact@acme.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="123 Main St, City"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invoice-email">Invoice Email</Label>
              <Input
                id="invoice-email"
                type="email"
                value={form.invoiceEmail}
                onChange={(e) =>
                  setForm({ ...form, invoiceEmail: e.target.value })
                }
                placeholder="billing@acme.com"
              />
            </div>
            <div className="grid gap-3 rounded-md border p-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="schedule-enabled"
                  checked={form.invoiceScheduleEnabled}
                  onCheckedChange={(v) =>
                    setForm({ ...form, invoiceScheduleEnabled: !!v })
                  }
                  className="mt-0.5"
                />
                <div className="grid gap-0.5">
                  <Label htmlFor="schedule-enabled" className="text-sm font-medium">
                    Auto-invoice on a schedule
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically build an invoice from billable time + uninvoiced expenses on the chosen interval.
                  </p>
                </div>
              </div>
              {form.invoiceScheduleEnabled && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label htmlFor="schedule-weeks" className="text-xs">
                        Every (weeks)
                      </Label>
                      <Input
                        id="schedule-weeks"
                        type="number"
                        min="1"
                        value={form.invoiceScheduleWeeks}
                        onChange={(e) =>
                          setForm({ ...form, invoiceScheduleWeeks: e.target.value })
                        }
                        placeholder="2"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="schedule-anchor" className="text-xs">
                        First send date
                      </Label>
                      <Input
                        id="schedule-anchor"
                        type="date"
                        value={form.invoiceScheduleAnchor}
                        onChange={(e) =>
                          setForm({ ...form, invoiceScheduleAnchor: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="schedule-autosend"
                      checked={form.invoiceScheduleAutoSend}
                      onCheckedChange={(v) =>
                        setForm({ ...form, invoiceScheduleAutoSend: !!v })
                      }
                      className="mt-0.5"
                    />
                    <div className="grid gap-0.5">
                      <Label htmlFor="schedule-autosend" className="text-sm font-medium">
                        Email automatically
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Off → invoice is created as a draft for you to review.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {CLIENT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="size-7 rounded-md ring-2 ring-offset-2 ring-offset-background transition-all"
                    style={{
                      backgroundColor: color,
                      ["--tw-ring-color" as string]:
                        form.color === color ? color : "transparent",
                    }}
                    onClick={() => setForm({ ...form, color })}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave}>
              {editing ? "Save Changes" : "Create Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
