"use client"

import Link from "next/link"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { InvoiceEstimateRow, InvoiceEstimatePreview } from "@/components/invoice-estimates"
import { PaymentOptions, SecondaryTotalRow } from "@/components/invoice-payment-options"
import { buildInvoiceEstimates, invoicedSourceIds } from "@/lib/invoice-estimates"
import { billedSeconds } from "@/lib/billing"
import { PageHeader } from "@/components/page-header"
import { SheetAction } from "@/components/more-sheet"
import {
  InvoiceStatusBadge,
  invoiceStatusDots,
  invoiceStatusLabels,
  invoiceStatusStyles,
} from "@/components/status-badge"
import { applyEmailTemplateVariables } from "@/lib/email-template"
import { useStore } from "@/lib/store"
import { useMoney } from "@/lib/display-currency"
import { formatCurrency, formatHours } from "@/lib/format"
import {
  INVOICE_CURRENCY,
  formatRateDate,
  formatWithCode,
  needsFxLock,
  paymentAccounts,
  secondaryCurrencyFor,
  secondaryTotal,
  toFxLock,
  type ExchangeQuote,
  type FxLock,
} from "@/lib/invoice-currency"
import { fetchQuote, useExchangeRate } from "@/lib/use-exchange-rate"
import { cn } from "@/lib/utils"
import type { Client, Invoice, InvoiceLineItem, Settings, TimeEntry, Expense } from "@/lib/types"

const STATUS_OPTIONS = Object.keys(invoiceStatusLabels) as Invoice["status"][]

function invoiceDueLabel(invoice: Invoice): string {
  return invoice.dueDate === invoice.issueDate
    ? "Due on receipt"
    : format(parseISO(invoice.dueDate), "MMM d, yyyy")
}

/** "Nov 28" this year, "Nov 28, 2025" otherwise, for compact phone rows. */
function shortDate(iso: string): string {
  const date = parseISO(iso)
  return format(date, date.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy")
}

function isPastDue(invoice: Invoice): boolean {
  if (invoice.status === "paid") return false
  if (invoice.dueDate === invoice.issueDate) return false
  return parseISO(invoice.dueDate).getTime() < Date.now()
}

/** The extra currency this invoice's client is offered, if any. */
function invoiceSecondaryCurrency(client: Client | undefined, settings: Settings) {
  return secondaryCurrencyFor(client?.showSecondaryCurrency, settings.secondaryRemittance)
}

/** The converted amount stored on an issued invoice, for list rows. */
function lockedSecondaryLabel(invoice: Invoice): string | null {
  const locked = secondaryTotal(invoice, null, null, null)
  return locked ? formatWithCode(locked.amount, locked.currency) : null
}

/** Inline message under a field; its id is what the field's aria-describedby points at. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} tabIndex={-1} className="text-xs text-destructive outline-none">
      {message}
    </p>
  )
}

function invalidProps(id: string, message?: string) {
  return {
    "aria-invalid": !!message || undefined,
    "aria-describedby": message ? `${id}-error` : undefined,
  }
}

function StatusMenu({
  invoice,
  onChange,
  className,
}: {
  invoice: Invoice
  onChange: (status: Invoice["status"]) => void
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Change status for ${invoice.invoiceNumber}`}
          className={cn(
            "inline-flex h-6 pointer-coarse:h-9 items-center gap-1.5 rounded-md pr-1.5 pl-2 text-xs font-medium whitespace-nowrap transition-colors hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            invoiceStatusStyles[invoice.status],
            className
          )}
        >
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", invoiceStatusDots[invoice.status])}
          />
          {invoiceStatusLabels[invoice.status]}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        {STATUS_OPTIONS.map((status) => (
          <DropdownMenuItem
            key={status}
            className="max-sm:min-h-11"
            onClick={() => status !== invoice.status && onChange(status)}
          >
            <span aria-hidden className={cn("size-2 rounded-full", invoiceStatusDots[status])} />
            {invoiceStatusLabels[status]}
            {status === invoice.status && (
              <Check className="ml-auto size-3.5 opacity-60" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Secondary row actions; Preview stays visible beside it on desktop and joins the menu on phones. */
function InvoiceActionsMenu({
  invoice,
  downloading,
  sending,
  onPreview,
  onDownload,
  onEdit,
  onSend,
  onDelete,
  className,
}: {
  invoice: Invoice
  downloading: boolean
  sending: boolean
  onPreview?: () => void
  onDownload: () => void
  onEdit: () => void
  onSend: () => void
  onDelete: () => void
  className?: string
}) {
  const reissue = invoice.status === "sent"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className={cn("shrink-0", className)}
          aria-label={`More actions for ${invoice.invoiceNumber}`}
          title="More actions"
        >
          {downloading || sending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <MoreHorizontal className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {onPreview && (
          <DropdownMenuItem className="max-sm:min-h-11" onClick={onPreview}>
            <Eye className="size-4" /> Preview
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="max-sm:min-h-11" onClick={onSend} disabled={sending}>
          <Send className="size-4" /> {reissue ? "Reissue invoice" : "Send invoice"}
        </DropdownMenuItem>
        <DropdownMenuItem className="max-sm:min-h-11" onClick={onDownload} disabled={downloading}>
          <Download className="size-4" /> Download PDF
        </DropdownMenuItem>
        <DropdownMenuItem className="max-sm:min-h-11" onClick={onEdit}>
          <Pencil className="size-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="max-sm:min-h-11" variant="destructive" onClick={onDelete}>
          <Trash2 className="size-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function InvoicesPage() {
  const { money, currency: displayCurrency } = useMoney()
  // An issued invoice that locked an amount in the chosen currency shows that amount, since
  // it's what the client was asked to pay; today's conversion would differ.
  function listTotal(invoice: Invoice) {
    const locked = secondaryTotal(invoice, null, null, null)
    return locked?.currency === displayCurrency
      ? { total: formatCurrency(locked.amount, locked.currency), secondary: null }
      : { total: money(invoice.total), secondary: lockedSecondaryLabel(invoice) }
  }
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
  const [estimateId, setEstimateId] = useState<string | null>(null)

  const [selectedClientId, setSelectedClientId] = useState("")
  const [taxRate, setTaxRate] = useState("0")
  const [notes, setNotes] = useState("")
  const [dueDays, setDueDays] = useState("30")
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set())
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(
    new Set()
  )

  const [createErrors, setCreateErrors] = useState<{ client?: string; items?: string; dueDays?: string }>({})

  // Edit form state
  const [editDueError, setEditDueError] = useState<string | null>(null)
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

  const invoiceEstimates = useMemo(() => buildInvoiceEstimates(data), [data])

  const unbilledEntries = useMemo(() => {
    const billed = invoicedSourceIds(data.invoices, "time")
    const entries: (TimeEntry & { projectName: string; rate: number })[] = []
    for (const project of clientProjects) {
      const projectEntries = getTimeEntriesByProject(project.id)
      for (const entry of projectEntries) {
        if (entry.billable && !billed.has(entry.id)) {
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
  }, [clientProjects, getTimeEntriesByProject, data.invoices])

  const unbilledExpenses = useMemo(() => {
    const billed = invoicedSourceIds(data.invoices, "expense")
    const expenses: (Expense & { projectName: string })[] = []
    for (const project of clientProjects) {
      const projectExpenses = getExpensesByProject(project.id)
      for (const expense of projectExpenses) {
        if (!expense.invoiced && !billed.has(expense.id)) {
          expenses.push({ ...expense, projectName: project.name })
        }
      }
    }
    return expenses.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }, [clientProjects, getExpensesByProject, data.invoices])

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
    setCreateErrors({})
    setCreateOpen(true)
  }

  function openEdit(invoice: Invoice) {
    const currentDueDays = differenceInCalendarDays(
      parseISO(invoice.dueDate),
      parseISO(invoice.issueDate)
    )
    setEditInvoice(invoice)
    setEditDueError(null)
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

  /**
   * Issuing a draft records today's rate for clients offered a second currency,
   * so the converted total never moves after the client has seen it.
   */
  async function issueFxLock(
    invoice: Invoice,
    nextStatus: Invoice["status"]
  ): Promise<Partial<FxLock>> {
    if (invoice.status !== "draft" || nextStatus === "draft") return {}
    const currency = invoiceSecondaryCurrency(
      getClient(invoice.clientId),
      data.settings
    )
    if (!needsFxLock(invoice, currency)) return {}
    return toFxLock(currency, await fetchQuote(INVOICE_CURRENCY, currency))
  }

  function clearItemsError() {
    setCreateErrors((current) => (current.items ? { ...current, items: undefined } : current))
  }

  function toggleEntry(id: string) {
    clearItemsError()
    setSelectedEntries((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleExpense(id: string) {
    clearItemsError()
    setSelectedExpenses((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllEntries() {
    clearItemsError()
    if (selectedEntries.size === unbilledEntries.length) {
      setSelectedEntries(new Set())
    } else {
      setSelectedEntries(new Set(unbilledEntries.map((e) => e.id)))
    }
  }

  function selectAllExpenses() {
    clearItemsError()
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
      const hours = billedSeconds(entry) / 3600
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
    const parsedDueDays = Number.parseInt(dueDays, 10)
    const errors = {
      client: selectedClientId ? undefined : "Choose a client",
      items:
        selectedClientId && lineItemsPreview.length === 0
          ? "Select at least one time entry or expense"
          : undefined,
      dueDays:
        !Number.isFinite(parsedDueDays) || parsedDueDays < 0
          ? "Enter 0 or more days"
          : undefined,
    }
    if (errors.client || errors.items || errors.dueDays) {
      setCreateErrors(errors)
      // The items message renders with this state change, so look up the target a frame later.
      requestAnimationFrame(() => {
        const target = errors.client
          ? document.getElementById("invoice-client")
          : errors.items
            ? (document.querySelector<HTMLElement>("#invoice-line-items button[role=checkbox]") ??
              document.getElementById("invoice-items-error"))
            : document.getElementById("due-days")
        target?.focus()
      })
      return
    }

    const invoiceNumber = `${data.settings.invoicePrefix}${data.settings.nextInvoiceNumber}`
    const today = format(new Date(), "yyyy-MM-dd")
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
      setEditDueError("Enter 0 or more days")
      document.getElementById("edit-due")?.focus()
      return
    }
    const parsedTax = Number.parseFloat(editTax)
    const taxAmount = Number.isFinite(parsedTax) ? parsedTax : 0
    const original = data.invoices.find((inv) => inv.id === editInvoice.id)
    let fxLock: Partial<FxLock> = {}
    try {
      fxLock = original ? await issueFxLock(original, editInvoice.status) : {}
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't get the exchange rate")
      return
    }
    const updates: Partial<Invoice> = {
      ...fxLock,
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
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error || "Failed to send")
      }
      const fx = (body.fx ?? null) as FxLock | null
      await updateInvoice(invoice.id, { status: "sent", ...(fx ?? {}) })
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
      const client = getClient(invoice.clientId)
      const currency = invoiceSecondaryCurrency(client, data.settings)
      // Drafts print today's rate; issued invoices keep the rate they were sent with.
      const quote: ExchangeQuote | null = needsFxLock(invoice, currency)
        ? await fetchQuote(INVOICE_CURRENCY, currency)
        : null
      const { downloadInvoicePdf } = await import("@/lib/invoice-pdf")
      await downloadInvoicePdf(
        invoice,
        client,
        data.settings,
        secondaryTotal(invoice, currency, data.settings.secondaryRemittance, quote)
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
    const invoice = data.invoices.find((inv) => inv.id === id)
    let fxLock: Partial<FxLock> = {}
    try {
      fxLock = invoice ? await issueFxLock(invoice, status) : {}
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't get the exchange rate")
      return
    }
    await updateInvoice(id, { status, ...fxLock })
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

  const filteredEstimates = invoiceEstimates.filter((estimate) => `${estimate.clientName} ${estimate.currency} invoice preview`.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <>
      <PageHeader
        title="Invoices"
        center={
          <div className="relative w-full min-w-0">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 pl-9 text-[16px]"
              placeholder="Search"
              aria-label="Search invoices by number, client, or status"
            />
          </div>
        }
        primary={{
          label: "New invoice",
          icon: Plus,
          onClick: openCreate,
          disabled: data.clients.length === 0,
          testId: "new-invoice",
        }}
        more={
          filteredEstimates.length > 0 ? (
            <SheetAction
              icon={Eye}
              label={`Review ${filteredEstimates.length === 1 ? "preview" : "previews"}`}
              detail={filteredEstimates.length}
              testId="review-invoice-previews-phone"
              onSelect={() => setEstimateId(filteredEstimates[0].id)}
            />
          ) : undefined
        }
        actions={
          <Button
            size="sm"
            onClick={openCreate}
            disabled={data.clients.length === 0}
            title={data.clients.length === 0 ? "Add a client first" : undefined}
          >
            <Plus className="size-3.5" data-icon="inline-start" />
            New invoice
          </Button>
        }
      />

      <Card data-testid="invoice-section" className="phone-flat">
        <CardHeader className="flex flex-col gap-3 max-sm:hidden sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-medium">Invoice log</CardTitle>
          {filteredEstimates.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              data-testid="review-invoice-previews"
              className="self-start sm:self-auto"
              onClick={() => setEstimateId(filteredEstimates[0].id)}
            >
              <Eye className="size-3.5 text-warning-foreground" data-icon="inline-start" />
              Review {filteredEstimates.length} {filteredEstimates.length === 1 ? "preview" : "previews"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
      <div className="mb-5 max-w-md max-sm:hidden">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            placeholder="Search invoices"
            aria-label="Search invoices by number, client, or status"
          />
        </div>
      </div>

      {filteredInvoices.length === 0 && filteredEstimates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed px-4 py-16 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-md bg-muted">
            <FileText aria-hidden className="size-5 text-muted-foreground" />
          </div>
          {search.trim() ? (
            <>
              <p className="text-sm font-medium">No invoices match “{search.trim()}”</p>
              <Button size="sm" variant="outline" className="mt-4" onClick={() => setSearch("")}>
                Clear search
              </Button>
            </>
          ) : data.clients.length === 0 ? (
            <>
              <p className="text-sm font-medium">No invoices yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a client and track some time to create your first invoice.
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href="/clients">Add a client</Link>
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">No invoices yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first invoice from tracked time and expenses.
              </p>
              <Button size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="size-4" data-icon="inline-start" />
                New invoice
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-md border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden xl:table-cell">Due</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {filteredEstimates.map((estimate) => <InvoiceEstimateRow key={estimate.id} estimate={estimate} onReview={() => setEstimateId(estimate.id)} />)}
              {filteredInvoices.map((inv) => {
                  const client = getClient(inv.clientId)
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="text-sm font-medium tabular-nums">
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
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(inv.issueDate), "MMM d, yyyy")}
                        {/* Below xl the Due column folds in here so the table fits beside the sidebar. */}
                        <span
                          className={cn(
                            "block text-xs xl:hidden",
                            isPastDue(inv) && "font-medium text-destructive"
                          )}
                        >
                          {inv.dueDate === inv.issueDate
                            ? "Due on receipt"
                            : `Due ${invoiceDueLabel(inv)}`}
                        </span>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "hidden text-sm xl:table-cell",
                          isPastDue(inv)
                            ? "font-medium text-destructive"
                            : "text-muted-foreground"
                        )}
                      >
                        {invoiceDueLabel(inv)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium tabular-nums">
                        {listTotal(inv).total}
                        {listTotal(inv).secondary && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            {listTotal(inv).secondary}
                          </span>
                        )}
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
                          <InvoiceActionsMenu
                            invoice={inv}
                            downloading={downloadingId === inv.id}
                            sending={sendingId === inv.id}
                            onDownload={() => handleDownload(inv)}
                            onEdit={() => openEdit(inv)}
                            onSend={() => openSend(inv)}
                            onDelete={() => setDeleteTarget(inv)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Phone and tablet list: two lines per invoice */}
          <ul className="divide-y overflow-hidden rounded-lg border bg-card lg:hidden" aria-label="Invoices">
            {filteredEstimates.map((estimate) => (
              <li key={estimate.id}>
                <InvoiceEstimateRow estimate={estimate} onReview={() => setEstimateId(estimate.id)} mobile />
              </li>
            ))}
            {filteredInvoices.map((inv) => {
              const client = getClient(inv.clientId)
              const { total, secondary } = listTotal(inv)
              return (
                <li key={inv.id} data-testid="invoice-row" className="flex items-center gap-1 py-1.5 pr-0.5 pl-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5 min-[360px]:gap-2">
                      <p className="min-w-0 truncate text-sm font-medium tabular-nums">{inv.invoiceNumber}</p>
                      <StatusMenu
                        invoice={inv}
                        className="relative shrink-0 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] max-[359px]:pr-2 max-[359px]:[&>svg]:hidden"
                        onChange={(status) => handleStatusChange(inv.id, status)}
                      />
                      <p className="ml-auto shrink-0 text-sm font-semibold tabular-nums">{total}</p>
                    </div>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      {client && (
                        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: client.color }} />
                      )}
                      <span className="min-w-0 flex-1 truncate">{client?.name ?? "—"}</span>
                      <span className={cn("shrink-0 tabular-nums", isPastDue(inv) && "font-medium text-destructive")}>
                        {inv.dueDate === inv.issueDate ? "Due on receipt" : `Due ${shortDate(inv.dueDate)}`}
                      </span>
                    </div>
                    {secondary && (
                      <p className="text-right text-xs text-muted-foreground tabular-nums">{secondary}</p>
                    )}
                  </div>
                  <InvoiceActionsMenu
                    invoice={inv}
                    downloading={downloadingId === inv.id}
                    sending={sendingId === inv.id}
                    onPreview={() => setPreviewInvoice(inv)}
                    onDownload={() => handleDownload(inv)}
                    onEdit={() => openEdit(inv)}
                    onSend={() => openSend(inv)}
                    onDelete={() => setDeleteTarget(inv)}
                    className="size-11 text-muted-foreground"
                  />
                </li>
              )
            })}
          </ul>
        </>
      )}

        </CardContent>
      </Card>
      <InvoiceEstimatePreview selected={invoiceEstimates.find((estimate) => estimate.id === estimateId)} onClose={() => setEstimateId(null)} />

      {/* Create Invoice Dialog — full-width responsive */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Create Invoice</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="grid content-start gap-2">
                <Label htmlFor="invoice-client">Client</Label>
                <Select
                  value={selectedClientId}
                  onValueChange={(v) => {
                    setSelectedClientId(v)
                    setSelectedEntries(new Set())
                    setSelectedExpenses(new Set())
                    setCreateErrors((current) => ({ ...current, client: undefined, items: undefined }))
                  }}
                >
                  <SelectTrigger
                    id="invoice-client"
                    className="w-full"
                    {...invalidProps("invoice-client", createErrors.client)}
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
                <FieldError id="invoice-client-error" message={createErrors.client} />
              </div>
              <div className="grid content-start gap-2">
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
              <div className="grid content-start gap-2">
                <Label htmlFor="due-days">
                  Due in (days)
                  {dueDays === "0" && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      on receipt
                    </span>
                  )}
                </Label>
                <Input
                  id="due-days"
                  type="number"
                  min="0"
                  value={dueDays}
                  onChange={(e) => {
                    setDueDays(e.target.value)
                    setCreateErrors((current) => ({ ...current, dueDays: undefined }))
                  }}
                  {...invalidProps("due-days", createErrors.dueDays)}
                />
                <FieldError id="due-days-error" message={createErrors.dueDays} />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="invoice-number">Invoice #</Label>
                <Input
                  id="invoice-number"
                  value={`${data.settings.invoicePrefix}${data.settings.nextInvoiceNumber}`}
                  disabled
                  className="font-mono"
                />
              </div>
            </div>

            {selectedClientId && (
              <div className="grid gap-2">
              <div
                id="invoice-line-items"
                role="group"
                aria-label="Time entries and expenses to invoice"
                aria-describedby={createErrors.items ? "invoice-items-error" : undefined}
                className="grid gap-6 lg:grid-cols-2"
              >
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
                    <div className={cn("max-h-64 space-y-1 overflow-y-auto rounded-md border p-2", createErrors.items && "border-destructive")}>
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
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {formatHours(billedSeconds(entry))}h
                          </span>
                          <span className="w-20 shrink-0 text-right text-xs font-medium tabular-nums">
                            {formatCurrency(
                              (billedSeconds(entry) / 3600) * entry.rate
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
                    <div className={cn("max-h-64 space-y-1 overflow-y-auto rounded-md border p-2", createErrors.items && "border-destructive")}>
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
                          <span className="w-20 shrink-0 text-right text-xs font-medium tabular-nums">
                            {formatCurrency(expense.amount)}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <FieldError id="invoice-items-error" message={createErrors.items} />
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
                    <span className="tabular-nums">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-muted-foreground">
                      Tax ({taxRate}%)
                    </span>
                    <span className="tabular-nums">{formatCurrency(tax)}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between py-1 text-lg font-bold">
                    <span>Total</span>
                    <span className="tabular-nums">{formatCurrency(total)}</span>
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
                  <Label htmlFor="edit-status">Status</Label>
                  <Select
                    value={editInvoice.status}
                    onValueChange={(v) =>
                      setEditInvoice({
                        ...editInvoice,
                        status: v as Invoice["status"],
                      })
                    }
                  >
                    <SelectTrigger id="edit-status" className="w-full">
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
                    onChange={(e) => {
                      setEditDueDays(e.target.value)
                      setEditDueError(null)
                    }}
                    placeholder="30"
                    aria-invalid={!!editDueError || undefined}
                    aria-describedby={editDueError ? "edit-due-error edit-due-hint" : "edit-due-hint"}
                  />
                  <FieldError id="edit-due-error" message={editDueError ?? undefined} />
                  <p id="edit-due-hint" className="text-xs text-muted-foreground">
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
                  <span className="tabular-nums">
                    {formatCurrency(editInvoice.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="tabular-nums">
                    {formatCurrency(parseFloat(editTax) || 0)}
                  </span>
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">
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
  const currency = invoiceSecondaryCurrency(client, settings)
  const { quote } = useExchangeRate(
    INVOICE_CURRENCY,
    needsFxLock(invoice, currency) ? currency : null
  )
  const secondary = secondaryTotal(
    invoice,
    currency,
    settings.secondaryRemittance,
    quote
  )
  const money = (amount: number) =>
    secondary ? formatWithCode(amount, INVOICE_CURRENCY) : formatCurrency(amount)
  const accounts = paymentAccounts(
    {
      firstName: settings.remittanceFirstName,
      lastName: settings.remittanceLastName,
      bankName: settings.remittanceBankName,
      routingNumber: settings.remittanceRoutingNumber,
      accountNumber: settings.remittanceAccountNumber,
      notes: settings.remittanceNotes,
    },
    invoice.total,
    secondary
  )

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-3 sm:px-6">
        <DialogTitle className="text-base font-semibold">
          {invoice.invoiceNumber}
        </DialogTitle>
        <div className="flex items-center gap-3">
          <InvoiceStatusBadge status={invoice.status} />
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
      {secondary && !secondary.locked && (
        <p className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground sm:px-6">
          The {secondary.currency} total uses the{" "}
          {secondary.date ? formatRateDate(secondary.date) : "latest"} rate.
          It&apos;s fixed when the invoice is sent.
        </p>
      )}
      <div className="mx-auto w-full max-w-[8.5in] bg-white px-4 py-6 text-black sm:px-[0.75in] sm:py-[0.5in] dark:bg-white">
        <div className="flex flex-col gap-4 border-b-2 border-black pb-4 sm:flex-row sm:items-start sm:justify-between">
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
          <div className="sm:text-right">
            <p className="font-mono text-3xl font-bold">
              {invoice.invoiceNumber}
            </p>
            <p className="mt-2 text-xs font-medium tracking-wider text-gray-400 uppercase">
              Total Due
            </p>
            <p className="font-mono text-xl font-bold">
              {money(invoice.total)}
            </p>
            {secondary && (
              <p className="font-mono text-sm text-gray-500">
                or {formatWithCode(secondary.amount, secondary.currency)}
              </p>
            )}
            <p className="text-sm text-gray-500">
              {invoice.dueDate === invoice.issueDate
                ? "Due on receipt"
                : `Due ${format(parseISO(invoice.dueDate), "MMM d, yyyy")}`}
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-between">
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
          <div className="sm:text-right">
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
              <th className="border-b-2 border-gray-200 px-2 py-3 sm:px-4 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase">
                Description
              </th>
              <th className="border-b-2 border-gray-200 px-2 py-3 sm:px-4 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">
                Qty
              </th>
              <th className="border-b-2 border-gray-200 px-2 py-3 sm:px-4 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">
                Rate
              </th>
              <th className="border-b-2 border-gray-200 px-2 py-3 sm:px-4 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((item) => (
              <tr key={item.id}>
                <td className="border-b border-gray-200 px-2 py-3 sm:px-4 text-sm">
                  {item.description}
                </td>
                <td className="border-b border-gray-200 px-2 py-3 sm:px-4 text-right font-mono text-sm">
                  {item.quantity}
                </td>
                <td className="border-b border-gray-200 px-2 py-3 sm:px-4 text-right font-mono text-sm">
                  {formatCurrency(item.unitPrice)}
                </td>
                <td className="border-b border-gray-200 px-2 py-3 sm:px-4 text-right font-mono text-sm font-medium">
                  {formatCurrency(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={`mt-6 ml-auto ${secondary ? "w-full max-w-sm" : "w-72"}`}>
          <div className="flex justify-between py-2 text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-mono">{money(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <span className="text-gray-500">Tax</span>
            <span className="font-mono">{money(invoice.tax)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-black py-3 text-lg font-bold">
            <span>Total</span>
            <span className="font-mono">{money(invoice.total)}</span>
          </div>
          {secondary && <SecondaryTotalRow secondary={secondary} />}
        </div>

        {invoice.notes && (
          <div className="mt-8 rounded-md bg-gray-50 p-4">
            <p className="text-xs font-medium text-gray-500">Notes</p>
            <p className="mt-1 text-sm whitespace-pre-line text-gray-700">
              {invoice.notes}
            </p>
          </div>
        )}

        <PaymentOptions accounts={accounts} />

        <p className="mt-10 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
          Generated by {settings.businessName || "TimeTracker"}
        </p>
      </div>
    </>
  )
}
