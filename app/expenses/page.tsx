"use client"

import { useMemo, useState } from "react"
import {
  Plus,
  Trash2,
  Receipt,
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
import { useStore } from "@/lib/store"
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

export default function ExpensesPage() {
  const { data, addExpense, deleteExpense, getProject, getClient } = useStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)

  function openCreate() {
    setForm({
      ...emptyForm,
      projectId: data.projects[0]?.id ?? "",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.projectId) {
      toast.error("Select a project")
      return
    }
    if (!form.description.trim()) {
      toast.error("Description is required")
      return
    }
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount")
      return
    }
    await addExpense({
      projectId: form.projectId,
      description: form.description.trim(),
      amount,
      category: form.category,
      date: format(form.date, "yyyy-MM-dd"),
      notes: form.notes.trim(),
      invoiced: false,
    })
    toast.success("Expense added")
    setDialogOpen(false)
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
  const monthExpenses = data.expenses
    .filter((e) => e.date.startsWith(thisMonth))
    .reduce((s, e) => s + e.amount, 0)

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Track project expenses and costs"
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

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Expenses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold">
              {formatCurrency(totalExpenses)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold">
              {formatCurrency(monthExpenses)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-bold">
              {data.expenses.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {data.projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              Create a client and project first
            </p>
          </CardContent>
        </Card>
      ) : sortedExpenses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
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
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedExpenses.map((expense) => {
                const project = getProject(expense.projectId)
                const client = project
                  ? getClient(project.clientId)
                  : undefined
                return (
                  <TableRow key={expense.id}>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {expense.description}
                          </span>
                          {expense.invoiced && (
                            <Badge
                              variant="secondary"
                              className="bg-blue-500/10 text-[10px] text-blue-600 dark:text-blue-400"
                            >
                              Invoiced
                            </Badge>
                          )}
                        </div>
                        {expense.notes && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {expense.notes}
                          </p>
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
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          categoryColors[expense.category] ?? categoryColors.Other
                        }
                      >
                        {expense.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {format(new Date(expense.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-medium">
                      {formatCurrency(expense.amount)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setDeleteTarget(expense)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
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
            <DialogTitle>New Expense</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Project</Label>
              <Select
                value={form.projectId}
                onValueChange={(v) => setForm({ ...form, projectId: v })}
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
              <Label htmlFor="expense-desc">Description</Label>
              <Input
                id="expense-desc"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Domain renewal"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="expense-amount">Amount</Label>
                <Input
                  id="expense-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({ ...form, amount: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger>
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
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
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
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSave}>Add Expense</Button>
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
