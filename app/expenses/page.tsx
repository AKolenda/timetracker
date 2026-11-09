"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Plus,
  Pencil,
  Trash2,
  Receipt,
  CalendarIcon,
} from "lucide-react"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"

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
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { PageHeader } from "@/components/page-header"
import { RowActionsMenu } from "@/components/row-actions-menu"
import { StatCard, StatGrid } from "@/components/stat-card"
import { useStore } from "@/lib/store"
import { useMoney } from "@/lib/display-currency"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Expense } from "@/lib/types"

const EXPENSE_CATEGORIES = [
  "Software",
  "Hardware",
  "Travel",
  "Meals",
  "Office Supplies",
  "Subscriptions",
  "Communication",
  "Marketing",
  "Other",
]

const emptyForm = {
  projectId: "",
  description: "",
  amount: "",
  category: "Other",
  date: new Date(),
  notes: "",
}

const categoryColors: Record<string, string> = {
  Software: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  Hardware: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  Travel: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  Meals: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  "Office Supplies": "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  Subscriptions: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  Communication: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  Marketing: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  Other: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
}

/** "Nov 28" this year, "Nov 28, 2025" otherwise, for compact phone rows. */
function shortDate(iso: string): string {
  const date = parseISO(iso)
  return format(date, date.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy")
}

type FormErrors = { projectId?: string; description?: string; amount?: string }

const errorFieldIds: Record<keyof FormErrors, string> = {
  projectId: "expense-project",
  description: "expense-desc",
  amount: "expense-amount",
}

/** Inline message under a field; its id is what the field's aria-describedby points at. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  )
}

export default function ExpensesPage() {
  const { money } = useMoney()
  const { data, addExpense, updateExpense, deleteExpense, getProject, getClient } = useStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [editTarget, setEditTarget] = useState<Expense | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)

  function openCreate() {
    setEditTarget(null)
    setForm({
      ...emptyForm,
      projectId: data.projects[0]?.id ?? "",
    })
    setErrors({})
    setDialogOpen(true)
  }

  function openEdit(expense: Expense) {
    setEditTarget(expense)
    setForm({
      projectId: expense.projectId,
      description: expense.description,
      amount: String(expense.amount),
      category: expense.category,
      date: parseISO(expense.date),
      notes: expense.notes,
    })
    setErrors({})
    setDialogOpen(true)
  }

  function invoiceNumberFor(expense: Expense) {
    return data.invoices.find((invoice) => invoice.lineItems.some((item) => item.type === "expense" && item.sourceId === expense.id))?.invoiceNumber
  }

  async function handleSave() {
    const amount = parseFloat(form.amount)
    const nextErrors: FormErrors = {
      projectId: form.projectId ? undefined : "Choose a project",
      description: form.description.trim() ? undefined : "Enter a description",
      amount: !amount || amount <= 0 ? "Enter an amount greater than 0" : undefined,
    }
    const firstInvalid = (Object.keys(errorFieldIds) as (keyof FormErrors)[]).find((key) => nextErrors[key])
    if (firstInvalid) {
      setErrors(nextErrors)
      document.getElementById(errorFieldIds[firstInvalid])?.focus()
      return
    }
    const values = {
      projectId: form.projectId,
      description: form.description.trim(),
      amount,
      category: form.category,
      date: format(form.date, "yyyy-MM-dd"),
      notes: form.notes.trim(),
    }
    if (editTarget) {
      await updateExpense(editTarget.id, values)
      toast.success("Expense updated")
    } else {
      await addExpense({ ...values, invoiced: false })
      toast.success("Expense added")
    }
    setDialogOpen(false)
    setEditTarget(null)
  }

  const sortedExpenses = useMemo(
    () =>
      [...data.expenses].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    [data.expenses]
  )

  const totalExpenses = data.expenses.reduce((s, e) => s + e.amount, 0)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthEntries = data.expenses.filter((e) => e.date.startsWith(thisMonth))
  const monthExpenses = monthEntries.reduce((s, e) => s + e.amount, 0)

  function fieldErrorProps(field: keyof FormErrors) {
    return {
      "aria-invalid": !!errors[field] || undefined,
      "aria-describedby": errors[field] ? `${errorFieldIds[field]}-error` : undefined,
    }
  }

  function clearError(field: keyof FormErrors) {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  function invoiceLabel(expense: Expense) {
    const invoiceNumber = invoiceNumberFor(expense)
    if (invoiceNumber) return <span className="text-xs font-medium tabular-nums">{invoiceNumber}</span>
    if (expense.invoiced) return <span className="text-xs">Invoiced</span>
    return <span className="text-xs text-muted-foreground">Not invoiced</span>
  }

  function rowActionsMenu(expense: Expense) {
    return (
      <RowActionsMenu
        name={expense.description || "expense"}
        items={[
          { label: "Edit", icon: Pencil, onSelect: () => openEdit(expense) },
          { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setDeleteTarget(expense) },
        ]}
      />
    )
  }

  function rowActions(expense: Expense) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => openEdit(expense)}
          aria-label={`Edit ${expense.description}`}
          title="Edit"
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setDeleteTarget(expense)}
          aria-label={`Delete ${expense.description}`}
          title="Delete"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    )
  }

  function categoryBadge(expense: Expense) {
    return (
      <Badge
        variant="secondary"
        className={categoryColors[expense.category] ?? categoryColors.Other}
      >
        {expense.category}
      </Badge>
    )
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        primary={{
          label: "New expense",
          icon: Plus,
          onClick: openCreate,
          disabled: data.projects.length === 0,
          testId: "new-expense",
        }}
        actions={
          <Button
            size="sm"
            onClick={openCreate}
            disabled={data.projects.length === 0}
          >
            <Plus className="size-4" data-icon="inline-start" />
            New Expense
          </Button>
        }
      />

      <StatGrid className="mb-3 sm:mb-6">
        <StatCard
          label="Total expenses"
          value={money(totalExpenses)}
          hint={`${data.expenses.length} ${data.expenses.length === 1 ? "entry" : "entries"}`}
        />
        <StatCard
          label="This month"
          value={money(monthExpenses)}
          hint={`${monthEntries.length} ${monthEntries.length === 1 ? "entry" : "entries"}`}
        />
      </StatGrid>

      {data.projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <Receipt className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">
              {data.clients.length === 0 ? "Add a client and project first" : "Add a project first"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every expense belongs to a project.
            </p>
            <Button size="sm" variant="outline" className="mt-4" asChild>
              {data.clients.length === 0 ? (
                <Link href="/clients">Go to Clients</Link>
              ) : (
                <Link href="/projects">Go to Projects</Link>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : sortedExpenses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <Receipt className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No expenses yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Track your project costs and expenses
            </p>
            <Button size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="size-4" data-icon="inline-start" />
              New Expense
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <ul className="divide-y lg:hidden" aria-label="Expenses">
            {sortedExpenses.map((expense) => {
              const project = getProject(expense.projectId)
              return (
                <li key={expense.id} className="flex items-center gap-1 pr-0.5 sm:pr-2.5">
                  {/* Tapping the row edits it; Delete sits in the row's actions. */}
                  <button
                    type="button"
                    onClick={() => openEdit(expense)}
                    aria-label={`Edit ${expense.description}`}
                    className="min-w-0 flex-1 py-2.5 pl-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <span className="flex min-w-0 items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate font-medium">{expense.description}</span>
                      <span className="shrink-0 font-medium tabular-nums">{money(expense.amount)}</span>
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-baseline justify-between gap-3 text-xs text-muted-foreground tabular-nums">
                      <span className="min-w-0 truncate">
                        {shortDate(expense.date)} · {project?.name ?? "No project"} · {expense.category}
                      </span>
                      <span className={cn("shrink-0", (invoiceNumberFor(expense) || expense.invoiced) && "text-foreground")}>
                        {invoiceNumberFor(expense) ?? (expense.invoiced ? "Invoiced" : "Not invoiced")}
                      </span>
                    </span>
                    {expense.notes && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{expense.notes}</span>
                    )}
                  </button>
                  {rowActionsMenu(expense)}
                </li>
              )
            })}
          </ul>
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Description</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-20 pr-4"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedExpenses.map((expense) => {
                  const project = getProject(expense.projectId)
                  return (
                    <TableRow key={expense.id}>
                      <TableCell className="pl-4 whitespace-normal">
                        <span className="font-medium">{expense.description}</span>
                        {expense.notes && (
                          <p className="mt-0.5 line-clamp-2 max-w-sm text-xs text-muted-foreground">
                            {expense.notes}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {project?.name ?? "—"}
                      </TableCell>
                      <TableCell>{categoryBadge(expense)}</TableCell>
                      <TableCell>{invoiceLabel(expense)}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {format(parseISO(expense.date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {money(expense.amount)}
                      </TableCell>
                      <TableCell className="pr-4">{rowActions(expense)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Expense" : "New Expense"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {editTarget && invoiceNumberFor(editTarget) && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                This expense is on {invoiceNumberFor(editTarget)}. Saving
                changes here does not update that invoice.
              </p>
            )}
            <div className="grid gap-2">
              <Label htmlFor="expense-project">Project</Label>
              <Select
                value={form.projectId}
                onValueChange={(v) => {
                  setForm({ ...form, projectId: v })
                  clearError("projectId")
                }}
              >
                <SelectTrigger id="expense-project" className="w-full" {...fieldErrorProps("projectId")}>
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
              <FieldError id="expense-project-error" message={errors.projectId} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expense-desc">Description</Label>
              <Input
                id="expense-desc"
                value={form.description}
                onChange={(e) => {
                  setForm({ ...form, description: e.target.value })
                  clearError("description")
                }}
                placeholder="Domain renewal"
                {...fieldErrorProps("description")}
              />
              <FieldError id="expense-desc-error" message={errors.description} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid content-start gap-2">
                <Label htmlFor="expense-amount">Amount</Label>
                <Input
                  id="expense-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => {
                    setForm({ ...form, amount: e.target.value })
                    clearError("amount")
                  }}
                  placeholder="0.00"
                  {...fieldErrorProps("amount")}
                />
                <FieldError id="expense-amount-error" message={errors.amount} />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="expense-category">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger id="expense-category" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expense-date">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="expense-date"
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !form.date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon
                      className="size-4"
                      data-icon="inline-start"
                    />
                    {form.date
                      ? format(form.date, "PPP")
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.date}
                    defaultMonth={form.date}
                    onSelect={(d) => d && setForm({ ...form, date: d })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expense-notes">Notes (optional)</Label>
              <Textarea
                id="expense-notes"
                value={form.notes}
                onChange={(e) =>
                  setForm({ ...form, notes: e.target.value })
                }
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="sticky -bottom-4 bg-popover">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave}>
              {editTarget ? "Save Changes" : "Add Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;
              {deleteTarget?.description || "Untitled"}&rdquo; (
              {deleteTarget ? formatCurrency(deleteTarget.amount) : ""}). This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteTarget) {
                  await deleteExpense(deleteTarget.id)
                  toast.success("Expense deleted")
                  setDeleteTarget(null)
                }
              }}
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
