"use client"

import { useMemo, useState } from "react"
import { Plus, Send, Trash2, FileText, Eye, Pencil } from "lucide-react"
import { toast } from "sonner"
import { format, addDays } from "date-fns"

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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { PageHeader } from "@/components/page-header"
import { useStore } from "@/lib/store"
import { formatCurrency, formatHours } from "@/lib/format"
import type { Invoice, InvoiceLineItem, TimeEntry, Expense } from "@/lib/types"

const statusStyles: Record<Invoice["status"], string> = {
  draft: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  sent: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  overdue: "bg-red-500/10 text-red-600 dark:text-red-400",
}

export default function InvoicesPage() {
  const {
    data,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    updateExpense,
    updateSettings,
    getClient,
    getProject,
    getTimeEntriesByProject,
    getExpensesByProject,
    getProjectsByClient,
  } = useStore()

  const [createOpen, setCreateOpen] = useState(false)
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)

  const [selectedClientId, setSelectedClientId] = useState("")
  const [taxRate, setTaxRate] = useState("0")
  const [notes, setNotes] = useState("")
  const [dueDays, setDueDays] = useState("30")
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set())
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set())

  // Edit form state
  const [editNotes, setEditNotes] = useState("")
  const [editDueDays, setEditDueDays] = useState("")
  const [editTax, setEditTax] = useState("")

  const clientProjects = useMemo(
    () => (selectedClientId ? getProjectsByClient(selectedClientId) : []),
    [selectedClientId, getProjectsByClient]
  )

  const unbilledEntries = useMemo(() => {
    const entries: (TimeEntry & { projectName: string; rate: number })[] = []
    for (const project of clientProjects) {
      const projectEntries = getTimeEntriesByProject(project.id)
      for (const entry of projectEntries) {
        if (entry.billable) {
          entries.push({
            ...entry,
            projectName: project.name,
            rate: project.rate,
          })
        }
      }
    }
    return entries.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [clientProjects, getTimeEntriesByProject])

  const unbilledExpenses = useMemo(() => {
    const expenses: (Expense & { projectName: string })[] = []
    for (const project of clientProjects) {
      const projectExpenses = getExpensesByProject(project.id)
      for (const expense of projectExpenses) {
        if (!expense.invoiced) {
          expenses.push({ ...expense, projectName: project.name })
        }
      }
    }
    return expenses.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [clientProjects, getExpensesByProject])

  function openCreate() {
    setSelectedClientId(data.clients[0]?.id ?? "")
    setTaxRate("0")
    setNotes("")
    setDueDays(String(data.settings.defaultInvoiceDueDays ?? 30))
    setSelectedEntries(new Set())
    setSelectedExpenses(new Set())
    setCreateOpen(true)
  }

  function openEdit(invoice: Invoice) {
    setEditInvoice(invoice)
    setEditNotes(invoice.notes)
    setEditDueDays("")
    setEditTax(invoice.tax.toString())
  }

  function toggleEntry(id: string) {
    setSelectedEntries((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleExpense(id: string) {
    setSelectedExpenses((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllEntries() {
    if (selectedEntries.size === unbilledEntries.length) {
      setSelectedEntries(new Set())
    } else {
      setSelectedEntries(new Set(unbilledEntries.map((e) => e.id)))
    }
  }

  function selectAllExpenses() {
    if (selectedExpenses.size === unbilledExpenses.length) {
      setSelectedExpenses(new Set())
    } else {
      setSelectedExpenses(new Set(unbilledExpenses.map((e) => e.id)))
    }
  }

  const lineItemsPreview = useMemo(() => {
    const items: Omit<InvoiceLineItem, "id" | "invoiceId">[] = []
    for (const entry of unbilledEntries) {
      if (!selectedEntries.has(entry.id)) continue
      const hours = entry.duration / 3600
      items.push({
        description: `${entry.projectName}: ${entry.description || "Time entry"} (${format(new Date(entry.date), "MMM d")})`,
        quantity: parseFloat(hours.toFixed(2)),
        unitPrice: entry.rate,
        amount: parseFloat((hours * entry.rate).toFixed(2)),
        type: "time",
        sourceId: entry.id,
      })
    }
    for (const expense of unbilledExpenses) {
      if (!selectedExpenses.has(expense.id)) continue
      items.push({
        description: `${expense.projectName}: ${expense.description}`,
        quantity: 1,
        unitPrice: expense.amount,
        amount: expense.amount,
        type: "expense",
        sourceId: expense.id,
      })
    }
    return items
  }, [unbilledEntries, unbilledExpenses, selectedEntries, selectedExpenses])

  const subtotal = lineItemsPreview.reduce((s, i) => s + i.amount, 0)
  const tax = subtotal * (parseFloat(taxRate) / 100)
  const total = subtotal + tax

  async function handleCreate() {
    if (!selectedClientId) {
      toast.error("Select a client")
      return
    }
    if (lineItemsPreview.length === 0) {
      toast.error("Select at least one time entry or expense")
      return
    }

    const invoiceNumber = `${data.settings.invoicePrefix}${data.settings.nextInvoiceNumber}`
    const today = format(new Date(), "yyyy-MM-dd")
    const parsedDueDays = parseInt(dueDays)
    const dueOffset = Number.isFinite(parsedDueDays) ? parsedDueDays : 30
    const due = format(addDays(new Date(), dueOffset), "yyyy-MM-dd")

    await addInvoice(
      {
        invoiceNumber,
        clientId: selectedClientId,
        status: "draft",
        issueDate: today,
        dueDate: due,
        subtotal: parseFloat(subtotal.toFixed(2)),
        tax: parseFloat(tax.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
        notes,
      },
      lineItemsPreview
    )

    // Mark expenses as invoiced
    for (const expenseId of selectedExpenses) {
      await updateExpense(expenseId, { invoiced: true })
    }

    await updateSettings({
      nextInvoiceNumber: data.settings.nextInvoiceNumber + 1,
    })

    toast.success(`Invoice ${invoiceNumber} created`)
    setCreateOpen(false)
  }

  async function handleEditSave() {
    if (!editInvoice) return
    const updates: Partial<Invoice> = {
      notes: editNotes,
      tax: parseFloat(editTax) || 0,
      total: editInvoice.subtotal + (parseFloat(editTax) || 0),
    }
    if (editDueDays) {
      updates.dueDate = format(
        addDays(new Date(editInvoice.issueDate), parseInt(editDueDays) || 30),
        "yyyy-MM-dd"
      )
    }
    await updateInvoice(editInvoice.id, updates)
    toast.success("Invoice updated")
    setEditInvoice(null)
  }

  async function handleSend(invoice: Invoice) {
    const client = getClient(invoice.clientId)
    const email = client?.invoiceEmail || client?.email
    if (!email) {
      toast.error("Client has no invoice email configured")
      return
    }
    setSendingId(invoice.id)
    try {
      const res = await fetch("/api/send-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "Failed to send")
      }
      await updateInvoice(invoice.id, { status: "sent" })
      toast.success(`Invoice sent to ${email}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invoice")
    } finally {
      setSendingId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    // Un-mark expenses that were on this invoice
    for (const item of deleteTarget.lineItems) {
      if (item.type === "expense" && item.sourceId) {
        await updateExpense(item.sourceId, { invoiced: false })
      }
    }
    await deleteInvoice(deleteTarget.id)
    toast.success("Invoice deleted")
    setDeleteTarget(null)
  }

  async function handleStatusChange(id: string, status: Invoice["status"]) {
    await updateInvoice(id, { status })
    toast.success(`Status updated to ${status}`)
  }

  const sortedInvoices = useMemo(
    () =>
      [...data.invoices].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [data.invoices]
  )

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Generate and manage client invoices"
        actions={
          <Button
            size="sm"
            onClick={openCreate}
            disabled={data.clients.length === 0}
          >
            <Plus className="size-4" data-icon="inline-start" />
            New Invoice
          </Button>
        }
      />

      {sortedInvoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <FileText className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No invoices yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first invoice from tracked time and expenses
            </p>
            <Button
              size="sm"
              className="mt-4"
              onClick={openCreate}
              disabled={data.clients.length === 0}
            >
              <Plus className="size-4" data-icon="inline-start" />
              New Invoice
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedInvoices.map((inv) => {
                const client = getClient(inv.clientId)
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm font-medium">
                      {inv.invoiceNumber}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {client && (
                          <div
                            className="size-2 rounded-full"
                            style={{ backgroundColor: client.color }}
                          />
                        )}
                        <span className="text-sm">
                          {client?.name ?? "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {format(new Date(inv.issueDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {format(new Date(inv.dueDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium">
                      {formatCurrency(inv.total)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={inv.status}
                        onValueChange={(v) =>
                          handleStatusChange(inv.id, v as Invoice["status"])
                        }
                      >
                        <SelectTrigger className="h-7 w-[100px] border-0 bg-transparent p-0 shadow-none">
                          <Badge
                            variant="secondary"
                            className={statusStyles[inv.status]}
                          >
                            {inv.status}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="sent">Sent</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setPreviewInvoice(inv)}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => openEdit(inv)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleSend(inv)}
                          disabled={sendingId === inv.id}
                        >
                          <Send className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => setDeleteTarget(inv)}
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
        </Card>
      )}

      {/* Create Invoice Dialog — full-width responsive */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="grid gap-2">
                <Label>Client</Label>
                <Select
                  value={selectedClientId}
                  onValueChange={(v) => {
                    setSelectedClientId(v)
                    setSelectedEntries(new Set())
                    setSelectedExpenses(new Set())
                  }}
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
              <div className="grid gap-2">
                <Label htmlFor="tax-rate">Tax %</Label>
                <Input
                  id="tax-rate"
                  type="number"
                  min="0"
                  step="0.1"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="due-days">
                  Due in (days)
                  {dueDays === "0" && (
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                      on receipt
                    </span>
                  )}
                </Label>
                <Input
                  id="due-days"
                  type="number"
                  min="0"
                  value={dueDays}
                  onChange={(e) => setDueDays(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Invoice #</Label>
                <Input
                  value={`${data.settings.invoicePrefix}${data.settings.nextInvoiceNumber}`}
                  disabled
                  className="font-mono"
                />
              </div>
            </div>

            {selectedClientId && (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Time Entries */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Time Entries
                      {unbilledEntries.length > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          ({unbilledEntries.length})
                        </span>
                      )}
                    </Label>
                    {unbilledEntries.length > 0 && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={selectAllEntries}
                      >
                        {selectedEntries.size === unbilledEntries.length
                          ? "Deselect All"
                          : "Select All"}
                      </Button>
                    )}
                  </div>
                  {unbilledEntries.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No billable time entries for this client
                    </div>
                  ) : (
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                      {unbilledEntries.map((entry) => (
                        <label
                          key={entry.id}
                          className="flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={selectedEntries.has(entry.id)}
                            onCheckedChange={() => toggleEntry(entry.id)}
                          />
                          <span className="flex-1 truncate">
                            {entry.projectName}:{" "}
                            {entry.description || "Untitled"}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">
                            {formatHours(entry.duration)}h
                          </span>
                          <span className="shrink-0 font-mono text-xs font-medium">
                            {formatCurrency(
                              (entry.duration / 3600) * entry.rate
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expenses — always shown */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      Expenses
                      {unbilledExpenses.length > 0 && (
                        <span className="ml-1 text-muted-foreground">
                          ({unbilledExpenses.length})
                        </span>
                      )}
                    </Label>
                    {unbilledExpenses.length > 0 && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={selectAllExpenses}
                      >
                        {selectedExpenses.size === unbilledExpenses.length
                          ? "Deselect All"
                          : "Select All"}
                      </Button>
                    )}
                  </div>
                  {unbilledExpenses.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                      No uninvoiced expenses for this client
                    </div>
                  ) : (
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
                      {unbilledExpenses.map((expense) => (
                        <label
                          key={expense.id}
                          className="flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={selectedExpenses.has(expense.id)}
                            onCheckedChange={() => toggleExpense(expense.id)}
                          />
                          <span className="flex-1 truncate">
                            {expense.projectName}: {expense.description}
                          </span>
                          <span className="shrink-0 font-mono text-xs font-medium">
                            {formatCurrency(expense.amount)}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <Separator />

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="inv-notes">Notes</Label>
                <Textarea
                  id="inv-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Payment terms, thank you message, etc."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <div className="rounded-md border p-4">
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-mono">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-muted-foreground">
                      Tax ({taxRate}%)
                    </span>
                    <span className="font-mono">{formatCurrency(tax)}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between py-1 text-lg font-bold">
                    <span>Total</span>
                    <span className="font-mono">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleCreate}>Create Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Invoice Dialog */}
      <Dialog
        open={!!editInvoice}
        onOpenChange={(open) => !open && setEditInvoice(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Edit Invoice {editInvoice?.invoiceNumber}
            </DialogTitle>
          </DialogHeader>
          {editInvoice && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={editInvoice.status}
                    onValueChange={(v) =>
                      setEditInvoice({
                        ...editInvoice,
                        status: v as Invoice["status"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-due">Extend due (days from issue)</Label>
                  <Input
                    id="edit-due"
                    type="number"
                    min="1"
                    value={editDueDays}
                    onChange={(e) => setEditDueDays(e.target.value)}
                    placeholder="30"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tax">Tax Amount</Label>
                <Input
                  id="edit-tax"
                  type="number"
                  min="0"
                  step="0.01"
                  value={editTax}
                  onChange={(e) => setEditTax(e.target.value)}
                />
              </div>
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-mono">
                    {formatCurrency(editInvoice.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-mono">
                    {formatCurrency(parseFloat(editTax) || 0)}
                  </span>
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="font-mono">
                    {formatCurrency(
                      editInvoice.subtotal + (parseFloat(editTax) || 0)
                    )}
                  </span>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={async () => {
                if (editInvoice) {
                  await handleStatusChange(editInvoice.id, editInvoice.status)
                  await handleEditSave()
                }
              }}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Preview Dialog — full PDF-size */}
      <Dialog
        open={!!previewInvoice}
        onOpenChange={(open) => !open && setPreviewInvoice(null)}
      >
        <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          {previewInvoice && (
            <InvoicePreview
              invoice={previewInvoice}
              client={getClient(previewInvoice.clientId)}
              settings={data.settings}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete invoice{" "}
              {deleteTarget?.invoiceNumber ?? ""} (
              {deleteTarget ? formatCurrency(deleteTarget.total) : ""}).
              Expenses from this invoice will become available for future invoices.
              This action cannot be undone.
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

function InvoicePreview({
  invoice,
  client,
  settings,
}: {
  invoice: Invoice
  client: ReturnType<ReturnType<typeof useStore>["getClient"]>
  settings: ReturnType<typeof useStore>["data"]["settings"]
}) {
  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-6 py-3">
        <DialogTitle className="text-base font-semibold">
          {invoice.invoiceNumber}
        </DialogTitle>
        <Badge variant="secondary" className={statusStyles[invoice.status]}>
          {invoice.status}
        </Badge>
      </div>
      <div className="mx-auto w-full max-w-[8.5in] bg-white px-[0.75in] py-[0.5in] text-black dark:bg-white">
        <div className="flex items-start justify-between border-b-2 border-black pb-4">
          <div>
            <h2 className="text-2xl font-bold">
              {settings.businessName || "Your Name"}
            </h2>
            {settings.businessEmail && (
              <p className="mt-1 text-sm text-gray-500">
                {settings.businessEmail}
              </p>
            )}
            {settings.businessPhone && (
              <p className="text-sm text-gray-500">{settings.businessPhone}</p>
            )}
            {settings.businessAddress && (
              <p className="mt-1 whitespace-pre-line text-sm text-gray-500">
                {settings.businessAddress}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="font-mono text-3xl font-bold">
              {invoice.invoiceNumber}
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
              Bill To
            </p>
            <p className="mt-2 text-lg font-semibold">{client?.name ?? "—"}</p>
            {client?.email && (
              <p className="text-sm text-gray-500">{client.email}</p>
            )}
            {client?.address && (
              <p className="whitespace-pre-line text-sm text-gray-500">
                {client.address}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">Issued:</span>{" "}
              {format(new Date(invoice.issueDate), "MMM d, yyyy")}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              <span className="font-medium text-gray-700">Due:</span>{" "}
              {format(new Date(invoice.dueDate), "MMM d, yyyy")}
            </p>
          </div>
        </div>

        <table className="mt-8 w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border-b-2 border-gray-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Description
              </th>
              <th className="border-b-2 border-gray-200 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Qty
              </th>
              <th className="border-b-2 border-gray-200 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Rate
              </th>
              <th className="border-b-2 border-gray-200 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((item) => (
              <tr key={item.id}>
                <td className="border-b border-gray-200 px-4 py-3 text-sm">
                  {item.description}
                </td>
                <td className="border-b border-gray-200 px-4 py-3 text-right font-mono text-sm">
                  {item.quantity}
                </td>
                <td className="border-b border-gray-200 px-4 py-3 text-right font-mono text-sm">
                  {formatCurrency(item.unitPrice)}
                </td>
                <td className="border-b border-gray-200 px-4 py-3 text-right font-mono text-sm font-medium">
                  {formatCurrency(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-6 w-72">
          <div className="flex justify-between py-2 text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-mono">{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <span className="text-gray-500">Tax</span>
            <span className="font-mono">{formatCurrency(invoice.tax)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-black py-3 text-lg font-bold">
            <span>Total</span>
            <span className="font-mono">{formatCurrency(invoice.total)}</span>
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-8 rounded-md bg-gray-50 p-4">
            <p className="text-xs font-medium text-gray-500">Notes</p>
            <p className="mt-1 whitespace-pre-line text-sm text-gray-700">
              {invoice.notes}
            </p>
          </div>
        )}

        {(settings.remittanceFirstName || settings.remittanceBankName) && (
          <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-5">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
              Remittance Information
            </p>
            {(settings.remittanceFirstName || settings.remittanceLastName) && (
              <p className="text-sm">
                <span className="text-gray-500">Pay to: </span>
                {settings.remittanceFirstName} {settings.remittanceLastName}
              </p>
            )}
            {settings.remittanceBankName && (
              <p className="text-sm">
                <span className="text-gray-500">Bank: </span>
                {settings.remittanceBankName}
              </p>
            )}
            {settings.remittanceRoutingNumber && (
              <p className="text-sm">
                <span className="text-gray-500">Routing: </span>
                <span className="font-mono">
                  {settings.remittanceRoutingNumber}
                </span>
              </p>
            )}
            {settings.remittanceAccountNumber && (
              <p className="text-sm">
                <span className="text-gray-500">Account: </span>
                <span className="font-mono">
                  {settings.remittanceAccountNumber}
                </span>
              </p>
            )}
            {settings.remittanceNotes && (
              <p className="mt-2 whitespace-pre-line text-xs text-gray-500">
                {settings.remittanceNotes}
              </p>
            )}
          </div>
        )}

        <p className="mt-10 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
          Generated by {settings.businessName || "TimeTracker"}
        </p>
      </div>
    </>
  )
}
