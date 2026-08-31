"use client"

import { useMemo, useState } from "react"
import {
  Plus,
  Send,
  Trash2,
  FileText,
  Eye,
  Pencil,
  Download,
  Loader2,
  Check,
  ChevronDown,
  MoreHorizontal,
  Search,
} from "lucide-react"
import { toast } from "sonner"
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { PageHeader } from "@/components/page-header"
import { applyEmailTemplateVariables } from "@/lib/email-template"
import { useStore } from "@/lib/store"
import { formatCurrency, formatHours } from "@/lib/format"
import type { Invoice, InvoiceLineItem, TimeEntry, Expense } from "@/lib/types"

const statusStyles: Record<Invoice["status"], string> = {
  draft: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  sent: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  overdue: "bg-red-500/10 text-red-600 dark:text-red-400",
}

const statusDots: Record<Invoice["status"], string> = {
  draft: "bg-gray-400",
  sent: "bg-blue-500",
  paid: "bg-emerald-500",
  overdue: "bg-red-500",
}

const statusLabels: Record<Invoice["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
}

const STATUS_OPTIONS = Object.keys(statusLabels) as Invoice["status"][]

function invoiceDueLabel(invoice: Invoice): string {
  return invoice.dueDate === invoice.issueDate
    ? "Due on receipt"
    : format(parseISO(invoice.dueDate), "MMM d, yyyy")
}

function isPastDue(invoice: Invoice): boolean {
  if (invoice.status === "paid") return false
  if (invoice.dueDate === invoice.issueDate) return false
  return parseISO(invoice.dueDate).getTime() < Date.now()
}

function StatusMenu({
  invoice,
  onChange,
}: {
  invoice: Invoice
  onChange: (status: Invoice["status"]) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Change status for ${invoice.invoiceNumber}`}
          className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-2 text-xs font-medium transition-colors hover:ring-1 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${statusStyles[invoice.status]}`}
        >
          <span
            className={`size-1.5 rounded-full ${statusDots[invoice.status]}`}
          />
          {statusLabels[invoice.status]}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        {STATUS_OPTIONS.map((status) => (
          <DropdownMenuItem
            key={status}
            onClick={() => status !== invoice.status && onChange(status)}
          >
            <span className={`size-2 rounded-full ${statusDots[status]}`} />
            {statusLabels[status]}
            {status === invoice.status && (
              <Check className="ml-auto size-3.5 opacity-60" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
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
    getTimeEntriesByProject,
    getExpensesByProject,
    getProjectsByClient,
  } = useStore()

  const [createOpen, setCreateOpen] = useState(false)
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [sendInvoice, setSendInvoice] = useState<Invoice | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const [selectedClientId, setSelectedClientId] = useState("")
  const [taxRate, setTaxRate] = useState("0")
  const [notes, setNotes] = useState("")
  const [dueDays, setDueDays] = useState("30")
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set())
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(
    new Set()
  )

  // Edit form state
  const [editNotes, setEditNotes] = useState("")
  const [editDueDays, setEditDueDays] = useState("")
  const [editTax, setEditTax] = useState("")

  // Per-send email overrides
  const [sendSubject, setSendSubject] = useState("")
  const [sendMessage, setSendMessage] = useState("")

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
    const configuredDueDays = Number(data.settings.defaultInvoiceDueDays)
    const defaultDueDays =
      Number.isFinite(configuredDueDays) && configuredDueDays >= 0
        ? configuredDueDays
        : 30
    setSelectedClientId(data.clients[0]?.id ?? "")
    setTaxRate("0")
    setNotes("")
    setDueDays(String(defaultDueDays))
    setSelectedEntries(new Set())
    setSelectedExpenses(new Set())
    setCreateOpen(true)
  }

  function openEdit(invoice: Invoice) {
    const currentDueDays = differenceInCalendarDays(
      parseISO(invoice.dueDate),
      parseISO(invoice.issueDate)
    )
    setEditInvoice(invoice)
    setEditNotes(invoice.notes)
    setEditDueDays(String(Math.max(0, currentDueDays)))
    setEditTax(invoice.tax.toString())
  }

  function openSend(invoice: Invoice) {
    const client = getClient(invoice.clientId)
    const email = client?.invoiceEmail || client?.email
    if (!email) {
      toast.error("Client has no invoice email configured")
      return
    }

    const dueLabel =
      invoice.dueDate === invoice.issueDate ? "Due on receipt" : invoice.dueDate
    const variables = {
      invoiceNumber: invoice.invoiceNumber,
      businessName: data.settings.businessName || "TimeTracker",
      clientName: client?.name ?? "",
      total: formatCurrency(invoice.total),
      dueDate: dueLabel,
    }
    const subjectTemplate =
      data.settings.emailSubject ||
      "Invoice {{invoiceNumber}} from {{businessName}}"
    const resolvedSubject = applyEmailTemplateVariables(
      subjectTemplate,
      variables
    )

    setSendInvoice(invoice)
    setSendSubject(
      invoice.status === "sent"
        ? `Reissued: ${resolvedSubject}`
        : resolvedSubject
    )
    setSendMessage(
      applyEmailTemplateVariables(data.settings.emailGreeting || "", variables)
    )
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
    const parsedDueDays = Number.parseInt(dueDays, 10)
    if (!Number.isFinite(parsedDueDays) || parsedDueDays < 0) {
      toast.error("Due days must be 0 or greater")
      return
    }
    const due = format(addDays(parseISO(today), parsedDueDays), "yyyy-MM-dd")

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
    const parsedDueDays = Number.parseInt(editDueDays, 10)
    if (!Number.isFinite(parsedDueDays) || parsedDueDays < 0) {
      toast.error("Due days must be 0 or greater")
      return
    }
    const parsedTax = Number.parseFloat(editTax)
    const taxAmount = Number.isFinite(parsedTax) ? parsedTax : 0
    const updates: Partial<Invoice> = {
      status: editInvoice.status,
      notes: editNotes,
      tax: taxAmount,
      total: editInvoice.subtotal + taxAmount,
      dueDate: format(
        addDays(parseISO(editInvoice.issueDate), parsedDueDays),
        "yyyy-MM-dd"
      ),
    }
    await updateInvoice(editInvoice.id, updates)
    toast.success(
      parsedDueDays === 0
        ? "Invoice updated — due on receipt"
        : "Invoice updated"
    )
    setEditInvoice(null)
  }

  async function handleSend() {
    if (!sendInvoice) return
    const invoice = sendInvoice
    const client = getClient(invoice.clientId)
    const email = client?.invoiceEmail || client?.email
    if (!email) {
      toast.error("Client has no invoice email configured")
      return
    }
    if (!sendSubject.trim()) {
      toast.error("Email subject is required")
      return
    }
    setSendingId(invoice.id)
    try {
      const res = await fetch("/api/send-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: invoice.id,
          subject: sendSubject.trim(),
          message: sendMessage.trim(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "Failed to send")
      }
      await updateInvoice(invoice.id, { status: "sent" })
      toast.success(
        `${invoice.status === "sent" ? "Invoice reissued" : "Invoice sent"} to ${email}`
      )
      setSendInvoice(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invoice")
    } finally {
      setSendingId(null)
    }
  }

  async function handleDownload(invoice: Invoice) {
    setDownloadingId(invoice.id)
    try {
      const { downloadInvoicePdf } = await import("@/lib/invoice-pdf")
      await downloadInvoicePdf(
        invoice,
        getClient(invoice.clientId),
        data.settings
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate PDF")
    } finally {
      setDownloadingId(null)
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
  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return sortedInvoices
    return sortedInvoices.filter((invoice) => {
      const client = getClient(invoice.clientId)
      return [invoice.invoiceNumber, client?.name, invoice.status, invoice.notes]
        .some((value) => value?.toLowerCase().includes(query))
    })
  }, [sortedInvoices, search, getClient])

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

      <div className="mb-5 max-w-md">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="Search invoice number, client, or status" /></div>
      </div>

      {filteredInvoices.length === 0 ? (
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
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
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
              {filteredInvoices.map((inv) => {
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
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: client.color }}
                            />
                          )}
                          <span className="text-sm">{client?.name ?? "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {format(new Date(inv.issueDate), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell
                        className={`font-mono text-xs ${
                          isPastDue(inv)
                            ? "font-medium text-red-600 dark:text-red-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {invoiceDueLabel(inv)}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium">
                        {formatCurrency(inv.total)}
                      </TableCell>
                      <TableCell>
                        <StatusMenu
                          invoice={inv}
                          onChange={(status) =>
                            handleStatusChange(inv.id, status)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setPreviewInvoice(inv)}
                            aria-label={`Preview ${inv.invoiceNumber}`}
                            title="Preview"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => handleDownload(inv)}
                            disabled={downloadingId === inv.id}
                            aria-label={`Download ${inv.invoiceNumber} PDF`}
                            title="Download PDF"
                          >
                            {downloadingId === inv.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Download className="size-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => openEdit(inv)}
                            aria-label={`Edit ${inv.invoiceNumber}`}
                            title="Edit"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => openSend(inv)}
                            disabled={sendingId === inv.id}
                            aria-label={`${inv.status === "sent" ? "Reissue" : "Send"} ${inv.invoiceNumber}`}
                            title={
                              inv.status === "sent"
                                ? "Reissue invoice"
                                : "Send invoice"
                            }
                          >
                            <Send className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setDeleteTarget(inv)}
                            aria-label={`Delete ${inv.invoiceNumber}`}
                            title="Delete"
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

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filteredInvoices.map((inv) => {
              const client = getClient(inv.clientId)
              return (
                <Card key={inv.id} className="py-0">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold">
                          {inv.invoiceNumber}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {client && (
                            <div
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: client.color }}
                            />
                          )}
                          <span className="truncate text-sm text-muted-foreground">
                            {client?.name ?? "—"}
                          </span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="-mr-1 -mt-1 shrink-0"
                            aria-label={`Actions for ${inv.invoiceNumber}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() => setPreviewInvoice(inv)}
                          >
                            <Eye className="size-4" /> Preview
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDownload(inv)}
                            disabled={downloadingId === inv.id}
                          >
                            <Download className="size-4" /> Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(inv)}>
                            <Pencil className="size-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openSend(inv)}
                            disabled={sendingId === inv.id}
                          >
                            <Send className="size-4" />
                            {inv.status === "sent" ? "Reissue" : "Send"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(inv)}
                          >
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div className="space-y-0.5 text-xs text-muted-foreground">
                        <p className="font-mono">
                          Issued {format(new Date(inv.issueDate), "MMM d, yyyy")}
                        </p>
                        <p
                          className={`font-mono ${
                            isPastDue(inv)
                              ? "font-medium text-red-600 dark:text-red-400"
                              : ""
                          }`}
                        >
                          {inv.dueDate === inv.issueDate
                            ? "Due on receipt"
                            : `Due ${format(parseISO(inv.dueDate), "MMM d, yyyy")}`}
                        </p>
                      </div>
                      <p className="font-mono text-base font-semibold">
                        {formatCurrency(inv.total)}
                      </p>
                    </div>

                    <div className="mt-3 border-t pt-3">
                      <StatusMenu
                        invoice={inv}
                        onChange={(status) => handleStatusChange(inv.id, status)}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Create Invoice Dialog — full-width responsive */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
                    <span className="font-mono">
                      {formatCurrency(subtotal)}
                    </span>
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
            <DialogTitle>Edit Invoice {editInvoice?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          {editInvoice && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <Label htmlFor="edit-due">Due in (days from issue)</Label>
                  <Input
                    id="edit-due"
                    type="number"
                    min="0"
                    value={editDueDays}
                    onChange={(e) => setEditDueDays(e.target.value)}
                    placeholder="30"
                  />
                  <p className="text-xs text-muted-foreground">
                    {editDueDays === "0"
                      ? "Due on receipt"
                      : "Use 0 for due on receipt"}
                  </p>
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
            <Button onClick={handleEditSave}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send / Reissue Invoice Dialog */}
      <Dialog
        open={!!sendInvoice}
        onOpenChange={(open) => !open && setSendInvoice(null)}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {sendInvoice?.status === "sent" ? "Reissue" : "Send"} Invoice{" "}
              {sendInvoice?.invoiceNumber}
            </DialogTitle>
          </DialogHeader>
          {sendInvoice && (
            <div className="grid gap-4 py-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">To</span>
                  <span className="truncate font-medium">
                    {getClient(sendInvoice.clientId)?.invoiceEmail ||
                      getClient(sendInvoice.clientId)?.email}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Payment terms</span>
                  <span className="font-medium">
                    {invoiceDueLabel(sendInvoice)}
                  </span>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="send-subject">Subject</Label>
                <Input
                  id="send-subject"
                  value={sendSubject}
                  onChange={(e) => setSendSubject(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="send-message">Message / note</Label>
                <Textarea
                  id="send-message"
                  value={sendMessage}
                  onChange={(e) => setSendMessage(e.target.value)}
                  rows={6}
                  maxLength={5000}
                  placeholder="Add a note for this invoice email"
                />
                <p className="text-xs text-muted-foreground">
                  This only changes this email. Your default template stays the
                  same.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={!!sendingId}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleSend}
              disabled={!!sendingId || !sendSubject.trim()}
            >
              {sendingId ? (
                <Loader2
                  className="size-4 animate-spin"
                  data-icon="inline-start"
                />
              ) : (
                <Send className="size-4" data-icon="inline-start" />
              )}
              {sendInvoice?.status === "sent"
                ? "Reissue Invoice"
                : "Send Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Preview Dialog — full PDF-size */}
      <Dialog
        open={!!previewInvoice}
        onOpenChange={(open) => !open && setPreviewInvoice(null)}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto p-0 sm:max-w-4xl">
          {previewInvoice && (
            <InvoicePreview
              invoice={previewInvoice}
              client={getClient(previewInvoice.clientId)}
              settings={data.settings}
              onDownload={() => handleDownload(previewInvoice)}
              downloading={downloadingId === previewInvoice.id}
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
              Expenses from this invoice will become available for future
              invoices. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="text-destructive-foreground bg-destructive hover:bg-destructive/90"
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
  onDownload,
  downloading,
}: {
  invoice: Invoice
  client: ReturnType<ReturnType<typeof useStore>["getClient"]>
  settings: ReturnType<typeof useStore>["data"]["settings"]
  onDownload: () => void
  downloading: boolean
}) {
  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background px-6 py-3">
        <DialogTitle className="text-base font-semibold">
          {invoice.invoiceNumber}
        </DialogTitle>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className={statusStyles[invoice.status]}>
            {invoice.status}
          </Badge>
          <Button size="sm" onClick={onDownload} disabled={downloading}>
            {downloading ? (
              <Loader2
                className="size-4 animate-spin"
                data-icon="inline-start"
              />
            ) : (
              <Download className="size-4" data-icon="inline-start" />
            )}
            Download PDF
          </Button>
        </div>
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
              <p className="mt-1 text-sm whitespace-pre-line text-gray-500">
                {settings.businessAddress}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="font-mono text-3xl font-bold">
              {invoice.invoiceNumber}
            </p>
            <p className="mt-2 text-xs font-medium tracking-wider text-gray-400 uppercase">
              Total Due
            </p>
            <p className="font-mono text-xl font-bold">
              {formatCurrency(invoice.total)}
            </p>
            <p className="text-sm text-gray-500">
              {invoice.dueDate === invoice.issueDate
                ? "Due on receipt"
                : `Due ${format(parseISO(invoice.dueDate), "MMM d, yyyy")}`}
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-between">
          <div>
            <p className="text-xs font-medium tracking-wider text-gray-400 uppercase">
              Bill To
            </p>
            <p className="mt-2 text-lg font-semibold">{client?.name ?? "—"}</p>
            {client?.email && (
              <p className="text-sm text-gray-500">{client.email}</p>
            )}
            {client?.address && (
              <p className="text-sm whitespace-pre-line text-gray-500">
                {client.address}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">Issued:</span>{" "}
              {format(new Date(invoice.issueDate), "MMM d, yyyy")}
            </p>
            {invoice.dueDate === invoice.issueDate ? (
              <p className="mt-1 text-sm font-medium text-gray-700">
                Due on receipt
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-500">
                <span className="font-medium text-gray-700">Due:</span>{" "}
                {invoiceDueLabel(invoice)}
              </p>
            )}
          </div>
        </div>

        <table className="mt-8 w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="border-b-2 border-gray-200 px-4 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase">
                Description
              </th>
              <th className="border-b-2 border-gray-200 px-4 py-3 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">
                Qty
              </th>
              <th className="border-b-2 border-gray-200 px-4 py-3 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">
                Rate
              </th>
              <th className="border-b-2 border-gray-200 px-4 py-3 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">
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

        <div className="mt-6 ml-auto w-72">
          <div className="flex justify-between py-2 text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-mono">
              {formatCurrency(invoice.subtotal)}
            </span>
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
            <p className="mt-1 text-sm whitespace-pre-line text-gray-700">
              {invoice.notes}
            </p>
          </div>
        )}

        {(settings.remittanceFirstName || settings.remittanceBankName) && (
          <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-5">
            <p className="mb-3 text-[11px] font-bold tracking-wider text-gray-500 uppercase">
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
              <p className="mt-2 text-xs whitespace-pre-line text-gray-500">
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
