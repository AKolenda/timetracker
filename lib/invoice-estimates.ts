import type { AppData } from "./types.ts"

export type EstimateItem = { id: string; projectName: string; description: string; date: string; hours: number | null; rate: number; amount: number }
export type InvoiceEstimate = { id: string; clientId: string; clientName: string; currency: string; items: EstimateItem[]; hours: number; expenses: number; subtotal: number }

export function invoicedSourceIds(invoices: AppData["invoices"], type: "time" | "expense"): Set<string> {
  return new Set(invoices.flatMap((invoice) => invoice.lineItems.filter((item) => item.type === type && item.sourceId).map((item) => item.sourceId!)))
}

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
    const estimate = estimates.get(id) ?? { id, clientId: client.id, clientName: client.name, currency, items: [], hours: 0, expenses: 0, subtotal: 0 }
    for (const entry of data.timeEntries) {
      if (entry.projectId !== project.id || !entry.billable || entry.duration <= 0 || billedTime.has(entry.id)) continue
      const hours = entry.duration / 3600
      const amount = Number((hours * project.rate).toFixed(2))
      estimate.items.push({ id: `time:${entry.id}`, projectName: project.name, description: entry.description || "Time entry", date: entry.date, hours, rate: project.rate, amount })
      estimate.hours += hours
    }
    for (const expense of data.expenses) {
      if (expense.projectId !== project.id || expense.invoiced || billedExpenses.has(expense.id)) continue
      estimate.items.push({ id: `expense:${expense.id}`, projectName: project.name, description: expense.description || "Expense", date: expense.date, hours: null, rate: expense.amount, amount: expense.amount })
      estimate.expenses += expense.amount
    }
    if (estimate.items.length) estimates.set(id, estimate)
  }
  return [...estimates.values()].map((estimate) => ({ ...estimate, items: estimate.items.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)), subtotal: Number(estimate.items.reduce((total, item) => total + item.amount, 0).toFixed(2)) })).sort((a, b) => a.clientName.localeCompare(b.clientName) || a.currency.localeCompare(b.currency))
}
