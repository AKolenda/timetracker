import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  Client,
  Project,
  TimeEntry,
  Expense,
  Invoice,
  InvoiceLineItem,
  Settings,
} from "../types"
import { defaultSettings } from "../types"
import type { DataProvider } from "./provider"

function rowToClient(row: Record<string, unknown>): Client {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    phone: row.phone as string,
    address: row.address as string,
    color: row.color as string,
    invoiceEmail: row.invoice_email as string,
    invoiceScheduleWeeks: row.invoice_schedule_weeks as number | null,
    lastInvoiceSent: row.last_invoice_sent as string | null,
    createdAt: row.created_at as string,
  }
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    name: row.name as string,
    rate: Number(row.rate),
    currency: row.currency as string,
    status: row.status as Project["status"],
    createdAt: row.created_at as string,
  }
}

function rowToTimeEntry(row: Record<string, unknown>): TimeEntry {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    description: row.description as string,
    startTime: row.start_time as string,
    endTime: row.end_time as string | null,
    duration: Number(row.duration),
    billable: row.billable as boolean,
    date: row.date as string,
  }
}

function rowToExpense(row: Record<string, unknown>): Expense {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    description: row.description as string,
    amount: Number(row.amount),
    category: row.category as string,
    date: row.date as string,
    notes: row.notes as string,
    invoiced: (row.invoiced as boolean) ?? false,
  }
}

function rowToSettings(row: Record<string, unknown>): Settings {
  return {
    id: row.id as string,
    businessName: row.business_name as string,
    businessEmail: row.business_email as string,
    businessPhone: row.business_phone as string,
    businessAddress: row.business_address as string,
    remittanceFirstName: row.remittance_first_name as string,
    remittanceLastName: row.remittance_last_name as string,
    remittanceBankName: row.remittance_bank_name as string,
    remittanceRoutingNumber: row.remittance_routing_number as string,
    remittanceAccountNumber: row.remittance_account_number as string,
    remittanceNotes: row.remittance_notes as string,
    invoicePrefix: row.invoice_prefix as string,
    nextInvoiceNumber: Number(row.next_invoice_number),
    payoutCurrency: (row.payout_currency as string) ?? "USD",
    payoutMinAmount: Number(row.payout_min_amount ?? 50),
    payoutNotes: (row.payout_notes as string) ?? "",
  }
}

function rowToInvoice(
  row: Record<string, unknown>,
  lineItems: InvoiceLineItem[]
): Invoice {
  return {
    id: row.id as string,
    invoiceNumber: row.invoice_number as string,
    clientId: row.client_id as string,
    status: row.status as Invoice["status"],
    issueDate: row.issue_date as string,
    dueDate: row.due_date as string,
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    total: Number(row.total),
    notes: row.notes as string,
    lineItems,
    createdAt: row.created_at as string,
  }
}

function rowToLineItem(row: Record<string, unknown>): InvoiceLineItem {
  return {
    id: row.id as string,
    invoiceId: row.invoice_id as string,
    description: row.description as string,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    amount: Number(row.amount),
    type: row.type as InvoiceLineItem["type"],
    sourceId: row.source_id as string | null,
  }
}

export class SupabaseProvider implements DataProvider {
  constructor(private db: SupabaseClient) {}

  async getClients(): Promise<Client[]> {
    const { data, error } = await this.db
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToClient)
  }

  async getClient(id: string): Promise<Client | null> {
    const { data, error } = await this.db
      .from("clients")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (error) throw error
    return data ? rowToClient(data) : null
  }

  async createClient(
    client: Omit<Client, "id" | "createdAt">
  ): Promise<Client> {
    const { data, error } = await this.db
      .from("clients")
      .insert({
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        color: client.color,
        invoice_email: client.invoiceEmail,
        invoice_schedule_weeks: client.invoiceScheduleWeeks,
      })
      .select()
      .single()
    if (error) throw error
    return rowToClient(data)
  }

  async updateClient(id: string, updates: Partial<Client>): Promise<void> {
    const row: Record<string, unknown> = {}
    if (updates.name !== undefined) row.name = updates.name
    if (updates.email !== undefined) row.email = updates.email
    if (updates.phone !== undefined) row.phone = updates.phone
    if (updates.address !== undefined) row.address = updates.address
    if (updates.color !== undefined) row.color = updates.color
    if (updates.invoiceEmail !== undefined)
      row.invoice_email = updates.invoiceEmail
    if (updates.invoiceScheduleWeeks !== undefined)
      row.invoice_schedule_weeks = updates.invoiceScheduleWeeks
    if (updates.lastInvoiceSent !== undefined)
      row.last_invoice_sent = updates.lastInvoiceSent
    const { error } = await this.db.from("clients").update(row).eq("id", id)
    if (error) throw error
  }

  async deleteClient(id: string): Promise<void> {
    const { error } = await this.db.from("clients").delete().eq("id", id)
    if (error) throw error
  }

  async getProjects(): Promise<Project[]> {
    const { data, error } = await this.db
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToProject)
  }

  async getProject(id: string): Promise<Project | null> {
    const { data, error } = await this.db
      .from("projects")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (error) throw error
    return data ? rowToProject(data) : null
  }

  async createProject(
    project: Omit<Project, "id" | "createdAt">
  ): Promise<Project> {
    const { data, error } = await this.db
      .from("projects")
      .insert({
        client_id: project.clientId,
        name: project.name,
        rate: project.rate,
        currency: project.currency,
        status: project.status,
      })
      .select()
      .single()
    if (error) throw error
    return rowToProject(data)
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<void> {
    const row: Record<string, unknown> = {}
    if (updates.name !== undefined) row.name = updates.name
    if (updates.clientId !== undefined) row.client_id = updates.clientId
    if (updates.rate !== undefined) row.rate = updates.rate
    if (updates.currency !== undefined) row.currency = updates.currency
    if (updates.status !== undefined) row.status = updates.status
    const { error } = await this.db.from("projects").update(row).eq("id", id)
    if (error) throw error
  }

  async deleteProject(id: string): Promise<void> {
    const { error } = await this.db.from("projects").delete().eq("id", id)
    if (error) throw error
  }

  async getTimeEntries(): Promise<TimeEntry[]> {
    const { data, error } = await this.db
      .from("time_entries")
      .select("*")
      .order("date", { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToTimeEntry)
  }

  async createTimeEntry(
    entry: Omit<TimeEntry, "id">
  ): Promise<TimeEntry> {
    const { data, error } = await this.db
      .from("time_entries")
      .insert({
        project_id: entry.projectId,
        description: entry.description,
        start_time: entry.startTime,
        end_time: entry.endTime,
        duration: entry.duration,
        billable: entry.billable,
        date: entry.date,
      })
      .select()
      .single()
    if (error) throw error
    return rowToTimeEntry(data)
  }

  async updateTimeEntry(
    id: string,
    updates: Partial<TimeEntry>
  ): Promise<void> {
    const row: Record<string, unknown> = {}
    if (updates.description !== undefined) row.description = updates.description
    if (updates.projectId !== undefined) row.project_id = updates.projectId
    if (updates.startTime !== undefined) row.start_time = updates.startTime
    if (updates.endTime !== undefined) row.end_time = updates.endTime
    if (updates.duration !== undefined) row.duration = updates.duration
    if (updates.billable !== undefined) row.billable = updates.billable
    if (updates.date !== undefined) row.date = updates.date
    const { error } = await this.db
      .from("time_entries")
      .update(row)
      .eq("id", id)
    if (error) throw error
  }

  async deleteTimeEntry(id: string): Promise<void> {
    const { error } = await this.db.from("time_entries").delete().eq("id", id)
    if (error) throw error
  }

  async getExpenses(): Promise<Expense[]> {
    const { data, error } = await this.db
      .from("expenses")
      .select("*")
      .order("date", { ascending: false })
    if (error) throw error
    return (data ?? []).map(rowToExpense)
  }

  async createExpense(expense: Omit<Expense, "id">): Promise<Expense> {
    const { data, error } = await this.db
      .from("expenses")
      .insert({
        project_id: expense.projectId,
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
        notes: expense.notes,
        invoiced: expense.invoiced ?? false,
      })
      .select()
      .single()
    if (error) throw error
    return rowToExpense(data)
  }

  async updateExpense(id: string, updates: Partial<Expense>): Promise<void> {
    const row: Record<string, unknown> = {}
    if (updates.description !== undefined) row.description = updates.description
    if (updates.amount !== undefined) row.amount = updates.amount
    if (updates.category !== undefined) row.category = updates.category
    if (updates.date !== undefined) row.date = updates.date
    if (updates.notes !== undefined) row.notes = updates.notes
    if (updates.invoiced !== undefined) row.invoiced = updates.invoiced
    const { error } = await this.db.from("expenses").update(row).eq("id", id)
    if (error) throw error
  }

  async deleteExpense(id: string): Promise<void> {
    const { error } = await this.db.from("expenses").delete().eq("id", id)
    if (error) throw error
  }

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.db
      .from("settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle()
    if (error) throw error
    return data ? rowToSettings(data) : defaultSettings
  }

  async updateSettings(updates: Partial<Settings>): Promise<void> {
    const row: Record<string, unknown> = {}
    if (updates.businessName !== undefined)
      row.business_name = updates.businessName
    if (updates.businessEmail !== undefined)
      row.business_email = updates.businessEmail
    if (updates.businessPhone !== undefined)
      row.business_phone = updates.businessPhone
    if (updates.businessAddress !== undefined)
      row.business_address = updates.businessAddress
    if (updates.remittanceFirstName !== undefined)
      row.remittance_first_name = updates.remittanceFirstName
    if (updates.remittanceLastName !== undefined)
      row.remittance_last_name = updates.remittanceLastName
    if (updates.remittanceBankName !== undefined)
      row.remittance_bank_name = updates.remittanceBankName
    if (updates.remittanceRoutingNumber !== undefined)
      row.remittance_routing_number = updates.remittanceRoutingNumber
    if (updates.remittanceAccountNumber !== undefined)
      row.remittance_account_number = updates.remittanceAccountNumber
    if (updates.remittanceNotes !== undefined)
      row.remittance_notes = updates.remittanceNotes
    if (updates.invoicePrefix !== undefined)
      row.invoice_prefix = updates.invoicePrefix
    if (updates.nextInvoiceNumber !== undefined)
      row.next_invoice_number = updates.nextInvoiceNumber
    if (updates.payoutCurrency !== undefined)
      row.payout_currency = updates.payoutCurrency
    if (updates.payoutMinAmount !== undefined)
      row.payout_min_amount = updates.payoutMinAmount
    if (updates.payoutNotes !== undefined)
      row.payout_notes = updates.payoutNotes
    const { error } = await this.db
      .from("settings")
      .update(row)
      .eq("id", "default")
    if (error) throw error
  }

  async getInvoices(): Promise<Invoice[]> {
    const { data, error } = await this.db
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) throw error
    const invoices: Invoice[] = []
    for (const row of data ?? []) {
      const { data: items } = await this.db
        .from("invoice_line_items")
        .select("*")
        .eq("invoice_id", row.id)
      invoices.push(
        rowToInvoice(row, (items ?? []).map(rowToLineItem))
      )
    }
    return invoices
  }

  async getInvoice(id: string): Promise<Invoice | null> {
    const { data, error } = await this.db
      .from("invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const { data: items } = await this.db
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", id)
    return rowToInvoice(data, (items ?? []).map(rowToLineItem))
  }

  async createInvoice(
    invoice: Omit<Invoice, "id" | "createdAt" | "lineItems">,
    lineItems: Omit<InvoiceLineItem, "id" | "invoiceId">[]
  ): Promise<Invoice> {
    const { data, error } = await this.db
      .from("invoices")
      .insert({
        invoice_number: invoice.invoiceNumber,
        client_id: invoice.clientId,
        status: invoice.status,
        issue_date: invoice.issueDate,
        due_date: invoice.dueDate,
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        total: invoice.total,
        notes: invoice.notes,
      })
      .select()
      .single()
    if (error) throw error

    const itemRows = lineItems.map((item) => ({
      invoice_id: data.id as string,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      amount: item.amount,
      type: item.type,
      source_id: item.sourceId,
    }))

    let items: InvoiceLineItem[] = []
    if (itemRows.length > 0) {
      const { data: insertedItems, error: itemsError } = await this.db
        .from("invoice_line_items")
        .insert(itemRows)
        .select()
      if (itemsError) throw itemsError
      items = (insertedItems ?? []).map(rowToLineItem)
    }

    return rowToInvoice(data, items)
  }

  async updateInvoice(id: string, updates: Partial<Invoice>): Promise<void> {
    const row: Record<string, unknown> = {}
    if (updates.status !== undefined) row.status = updates.status
    if (updates.notes !== undefined) row.notes = updates.notes
    if (updates.dueDate !== undefined) row.due_date = updates.dueDate
    if (updates.tax !== undefined) row.tax = updates.tax
    if (updates.total !== undefined) row.total = updates.total
    const { error } = await this.db.from("invoices").update(row).eq("id", id)
    if (error) throw error
  }

  async deleteInvoice(id: string): Promise<void> {
    const { error } = await this.db.from("invoices").delete().eq("id", id)
    if (error) throw error
  }
}
