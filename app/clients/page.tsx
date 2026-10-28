"use client"

import { useState } from "react"
import { formatCurrency, formatDate } from "@/lib/format"
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
  const {
    data,
    loading,
    addClient,
    updateClient,
    deleteClient,
    getProjectsByClient,
  } = useStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState(emptyForm)

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [invoicesOpen, setInvoicesOpen] = useState(false)
  const [invoiceSearch, setInvoiceSearch] = useState("")
  const [invoicePage, setInvoicePage] = useState(0)
  const selectedClient =
    data.clients.find((client) => client.id === selectedClientId) ??
    data.clients[0]
  const issuedInvoices = data.invoices.filter(
    (invoice) => invoice.status !== "draft"
  )
  const clientInvoices = issuedInvoices
    .filter((invoice) => invoice.clientId === selectedClient?.id)
    .sort(
      (a, b) =>
        b.issueDate.localeCompare(a.issueDate) ||
        b.createdAt.localeCompare(a.createdAt)
    )
  const lifetime = clientInvoices.reduce(
    (sum, invoice) => sum + invoice.total,
    0
  )
  const paid = clientInvoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.total, 0)
  const filteredInvoices = clientInvoices.filter((invoice) =>
    `${invoice.invoiceNumber} ${invoice.status} ${invoice.issueDate}`
      .toLowerCase()
      .includes(invoiceSearch.trim().toLowerCase())
  )
  const lastInvoicePage = Math.max(
    0,
    Math.ceil(filteredInvoices.length / 10) - 1
  )
  const currentInvoicePage = Math.min(invoicePage, lastInvoicePage)

  function invoiceRows(invoices: typeof clientInvoices) {
    return invoices.map((invoice) => (
      <div
        key={invoice.id}
        className="flex items-center justify-between gap-3 border-b py-3 last:border-0"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">
            {invoice.invoiceNumber}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(invoice.issueDate)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm tabular-nums">
            {formatCurrency(invoice.total)}
          </p>
          <p
            className={`text-xs capitalize ${invoice.status === "paid" ? "text-emerald-600 dark:text-emerald-400" : invoice.status === "overdue" ? "text-destructive" : "text-muted-foreground"}`}
          >
            {invoice.status}
          </p>
        </div>
      </div>
    ))
  }

  function openCreate() {
    setEditing(null)
    setForm({
      ...emptyForm,
      color: CLIENT_COLORS[Math.floor(Math.random() * CLIENT_COLORS.length)],
    })
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
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" data-icon="inline-start" />
            New Client
          </Button>
        }
      />

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Loading clients…
        </p>
      ) : data.clients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderKanban className="mb-4 size-6 text-muted-foreground" />
            <p className="text-sm font-medium">No clients yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first client to get started
            </p>
            <Button size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="size-4" />
              New Client
            </Button>
          </CardContent>
        </Card>
      ) : selectedClient ? (
        <>
          <div className="mb-4 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {data.clients.length}{" "}
              {data.clients.length === 1 ? "client" : "clients"} · Select a
              client to see billing
            </span>
            <span>All time · USD · Drafts excluded</span>
          </div>
          <div className="grid min-w-0 overflow-hidden rounded-lg border bg-card lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="min-w-0" aria-label="Clients">
              {data.clients.map((client) => {
                const total = issuedInvoices
                  .filter((invoice) => invoice.clientId === client.id)
                  .reduce((sum, invoice) => sum + invoice.total, 0)
                const selected = client.id === selectedClient.id
                return (
                  <button
                    key={client.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedClientId(client.id)}
                    className={`flex w-full items-center justify-between gap-3 border-b border-l-2 px-3 py-5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset sm:px-5 ${selected ? "border-l-primary bg-primary/10" : "border-l-transparent hover:bg-muted/50"}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className="size-8 shrink-0 rounded-md"
                        style={{
                          backgroundColor: client.color || CLIENT_COLORS[0],
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {client.name}
                        </span>
                        {client.email && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {client.email}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {formatCurrency(total)}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        Lifetime invoiced
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <section
              aria-label="Client billing detail"
              className="min-w-0 border-t p-4 sm:p-6 lg:border-t-0 lg:border-l"
            >
              <div className="mb-6 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold break-words">
                    {selectedClient.name}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getProjectsByClient(selectedClient.id).length}{" "}
                    {getProjectsByClient(selectedClient.id).length === 1
                      ? "project"
                      : "projects"}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Actions for ${selectedClient.name}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(selectedClient)}>
                      <Pencil className="size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleDelete(selectedClient)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <p className="text-xs text-muted-foreground">Lifetime invoiced</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight break-words tabular-nums sm:text-4xl">
                {formatCurrency(lifetime)}
              </p>
              <div className="mt-6 grid grid-cols-2 gap-4 border-b pb-6">
                <div>
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="mt-1 text-lg font-medium break-words tabular-nums">
                    {formatCurrency(paid)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="mt-1 text-lg font-medium break-words text-amber-700 tabular-nums dark:text-amber-300">
                    {formatCurrency(lifetime - paid)}
                  </p>
                </div>
              </div>
              <div className="space-y-2 border-b py-4 text-xs text-muted-foreground">
                {selectedClient.email && (
                  <p className="break-all">{selectedClient.email}</p>
                )}
                {selectedClient.phone && <p>{selectedClient.phone}</p>}
                {selectedClient.invoiceScheduleEnabled &&
                selectedClient.invoiceScheduleWeeks ? (
                  <span className="inline-flex rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-600 dark:text-emerald-400">
                    Auto-invoice every {selectedClient.invoiceScheduleWeeks}w
                    {!selectedClient.invoiceScheduleAutoSend && " (draft only)"}
                  </span>
                ) : (
                  <p>Manual invoicing</p>
                )}
              </div>
              <h3 className="mt-5 text-xs text-muted-foreground">
                Recent invoices · {clientInvoices.length} total
              </h3>
              {clientInvoices.length ? (
                invoiceRows(clientInvoices.slice(0, 5))
              ) : (
                <p className="py-6 text-sm text-muted-foreground">
                  No issued invoices yet. Drafts appear on the Invoices page.
                </p>
              )}
              {clientInvoices.length > 0 && (
                <Button
                  variant="link"
                  className="mt-2 px-0"
                  onClick={() => {
                    setInvoiceSearch("")
                    setInvoicePage(0)
                    setInvoicesOpen(true)
                  }}
                >
                  View all invoices
                </Button>
              )}
            </section>
          </div>
        </>
      ) : null}

      <Dialog open={invoicesOpen} onOpenChange={setInvoicesOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="break-words">
              {selectedClient?.name} invoices
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            All time · USD · Drafts excluded
          </p>
          <Input
            aria-label="Search invoices"
            placeholder="Search number, status, or date…"
            value={invoiceSearch}
            onChange={(event) => {
              setInvoiceSearch(event.target.value)
              setInvoicePage(0)
            }}
          />
          <div>
            {filteredInvoices.length ? (
              invoiceRows(
                filteredInvoices.slice(
                  currentInvoicePage * 10,
                  (currentInvoicePage + 1) * 10
                )
              )
            ) : (
              <p className="py-6 text-sm text-muted-foreground">
                No invoices match your search.
              </p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={currentInvoicePage === 0}
              onClick={() => setInvoicePage(currentInvoicePage - 1)}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentInvoicePage + 1} / {lastInvoicePage + 1}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={currentInvoicePage >= lastInvoicePage}
              onClick={() => setInvoicePage(currentInvoicePage + 1)}
            >
              Next
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Client" : "New Client"}</DialogTitle>
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
                  <Label
                    htmlFor="schedule-enabled"
                    className="text-sm font-medium"
                  >
                    Auto-invoice on a schedule
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically build an invoice from billable time +
                    uninvoiced expenses on the chosen interval.
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
                          setForm({
                            ...form,
                            invoiceScheduleWeeks: e.target.value,
                          })
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
                          setForm({
                            ...form,
                            invoiceScheduleAnchor: e.target.value,
                          })
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
                      <Label
                        htmlFor="schedule-autosend"
                        className="text-sm font-medium"
                      >
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
