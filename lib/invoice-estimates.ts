import type { AppData, TimeEntry } from "./types.ts"
import { billedSeconds } from "./billing.ts"
import { groupTimeLines, lineAmount } from "./invoice-lines.ts"

export type EstimateEntry = TimeEntry & { seconds: number; amount: number }
export type EstimateLine = {
  /** `time:<line key>` or `expense:<id>`. */
  id: string
  projectId: string
  projectName: string
  description: string
  /** Set on lines that group entries under a shared label. */
  label: string | null
  firstDate: string
  lastDate: string
  hours: number | null
  rate: number
  amount: number
  /** The time entries this line bills; empty for an expense. */
  entries: EstimateEntry[]
  expenseId?: string
}
export type InvoiceEstimate = { id: string; clientId: string; clientName: string; currency: string; lines: EstimateLine[]; entryCount: number; hours: number; expenses: number; subtotal: number }

export function invoicedSourceIds(invoices: AppData["invoices"], type: "time" | "expense"): Set<string> {
  return new Set(invoices.flatMap((invoice) => invoice.lineItems.filter((item) => item.type === type).flatMap((item) => [...(item.sourceIds ?? []), ...(item.sourceId ? [item.sourceId] : [])])))
}

/** Newest first: by the line's latest entry, so a day's lines keep the order they were worked in. */
const lineOrder = (line: EstimateLine) => line.entries.at(-1)?.startTime ?? line.lastDate

/** Hypothetical invoices only: never reserves items or consumes invoice numbers. */
export function buildInvoiceEstimates(data: Pick<AppData, "clients" | "projects" | "timeEntries" | "expenses" | "invoices">): InvoiceEstimate[] {
  const billedTime = invoicedSourceIds(data.invoices, "time")
  const billedExpenses = invoicedSourceIds(data.invoices, "expense")
  const clients = new Map(data.clients.map((client) => [client.id, client]))
  const estimates = new Map<string, InvoiceEstimate>()
  for (const project of data.projects) {
    const client = clients.get(project.clientId)
    if (!client) continue
    const currency = project.currency || "USD"
    const id = JSON.stringify([client.id, currency])
    const estimate = estimates.get(id) ?? { id, clientId: client.id, clientName: client.name, currency, lines: [], entryCount: 0, hours: 0, expenses: 0, subtotal: 0 }
    const entries = data.timeEntries
      .filter((entry) => entry.projectId === project.id && entry.billable && billedSeconds(entry) > 0 && !billedTime.has(entry.id))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .map((entry) => ({ ...entry, seconds: billedSeconds(entry), amount: lineAmount(billedSeconds(entry), project.rate) }))
    for (const line of groupTimeLines(entries)) {
      estimate.lines.push({ id: `time:${line.key}`, projectId: project.id, projectName: project.name, description: line.description, label: line.label, firstDate: line.firstDate, lastDate: line.lastDate, hours: line.seconds / 3600, rate: project.rate, amount: lineAmount(line.seconds, project.rate), entries: line.entries })
      estimate.hours += line.seconds / 3600
      estimate.entryCount += line.entries.length
    }
    for (const expense of data.expenses) {
      if (expense.projectId !== project.id || expense.invoiced || billedExpenses.has(expense.id)) continue
      estimate.lines.push({ id: `expense:${expense.id}`, projectId: project.id, projectName: project.name, description: expense.description || "Expense", label: null, firstDate: expense.date, lastDate: expense.date, hours: null, rate: expense.amount, amount: expense.amount, entries: [], expenseId: expense.id })
      estimate.expenses += expense.amount
    }
    if (estimate.lines.length) estimates.set(id, estimate)
  }
  return [...estimates.values()]
    .map((estimate) => ({ ...estimate, lines: estimate.lines.sort((a, b) => lineOrder(b).localeCompare(lineOrder(a))), subtotal: Number(estimate.lines.reduce((total, line) => total + line.amount, 0).toFixed(2)) }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.currency.localeCompare(b.currency))
}
