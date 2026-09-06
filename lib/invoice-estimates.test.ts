import assert from "node:assert/strict"
import test from "node:test"
import { buildInvoiceEstimates } from "./invoice-estimates.ts"
import type { Client, Project, TimeEntry, Expense, Invoice } from "./types.ts"

function fixture() {
  return {
    clients: [{ id: "vivian", name: "Vivian" }] as Client[],
    projects: [{ id: "project", clientId: "vivian", name: "Vivian Automations", rate: 100, currency: "USD" }] as Project[],
    timeEntries: [{ id: "time", projectId: "project", description: "Coding", date: "2026-09-05", startTime: "2026-09-05T10:00:00Z", endTime: "2026-09-05T11:30:00Z", duration: 5400, billable: true }] as TimeEntry[],
    expenses: [{ id: "expense", projectId: "project", description: "Hosting", date: "2026-09-05", amount: 20, invoiced: false }] as Expense[],
    invoices: [] as Invoice[],
  }
}

test("hypothetical invoice totals unbilled hours and expenses without mutating data", () => {
  const data = fixture()
  const before = structuredClone(data)
  const [preview] = buildInvoiceEstimates(data)
  assert.equal(preview.clientName, "Vivian")
  assert.equal(preview.hours, 1.5)
  assert.equal(preview.subtotal, 170)
  assert.equal(preview.items.length, 2)
  assert.deepEqual(data, before)
})

test("all invoice statuses reserve linked time and expenses, including drafts", () => {
  for (const status of ["draft", "sent", "paid", "overdue"] as const) {
    const data = fixture()
    data.invoices = [{ status, lineItems: [{ type: "time", sourceId: "time" }, { type: "expense", sourceId: "expense" }] }] as Invoice[]
    assert.deepEqual(buildInvoiceEstimates(data), [])
  }
})

test("excludes nonbillable time and invoiced expenses", () => {
  const data = fixture()
  data.timeEntries[0].billable = false
  data.expenses[0].invoiced = true
  assert.deepEqual(buildInvoiceEstimates(data), [])
  data.timeEntries[0].billable = true
  assert.equal(buildInvoiceEstimates(data)[0].subtotal, 150)
})

test("keeps currencies separate and rounds time amounts per line", () => {
  const data = fixture()
  data.projects.push({ ...data.projects[0], id: "cad", currency: "CAD", rate: 80 })
  data.timeEntries.push({ ...data.timeEntries[0], id: "cad-time", projectId: "cad", duration: 61 })
  const previews = buildInvoiceEstimates(data)
  assert.equal(previews.length, 2)
  assert.equal(previews.find((preview) => preview.currency === "USD")?.subtotal, 170)
  assert.equal(previews.find((preview) => preview.currency === "CAD")?.subtotal, 1.36)
})
