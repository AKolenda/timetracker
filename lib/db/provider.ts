import type {
  Client,
  Project,
  TimeEntry,
  Expense,
  Invoice,
  InvoiceLineItem,
  Settings,
} from "../types"

export interface DataProvider {
  // Clients
  getClients(): Promise<Client[]>
  getClient(id: string): Promise<Client | null>
  createClient(client: Omit<Client, "id" | "createdAt">): Promise<Client>
  updateClient(id: string, updates: Partial<Client>): Promise<void>
  deleteClient(id: string): Promise<void>

  // Projects
  getProjects(): Promise<Project[]>
  getProject(id: string): Promise<Project | null>
  createProject(project: Omit<Project, "id" | "createdAt">): Promise<Project>
  updateProject(id: string, updates: Partial<Project>): Promise<void>
  deleteProject(id: string): Promise<void>

  // Time Entries
  getTimeEntries(): Promise<TimeEntry[]>
  createTimeEntry(entry: Omit<TimeEntry, "id">): Promise<TimeEntry>
  updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<void>
  deleteTimeEntry(id: string): Promise<void>

  // Expenses
  getExpenses(): Promise<Expense[]>
  createExpense(expense: Omit<Expense, "id">): Promise<Expense>
  updateExpense(id: string, updates: Partial<Expense>): Promise<void>
  deleteExpense(id: string): Promise<void>

  // Settings
  getSettings(): Promise<Settings>
  updateSettings(updates: Partial<Settings>): Promise<void>

  // Invoices
  getInvoices(): Promise<Invoice[]>
  getInvoice(id: string): Promise<Invoice | null>
  createInvoice(
    invoice: Omit<Invoice, "id" | "createdAt" | "lineItems">,
    lineItems: Omit<InvoiceLineItem, "id" | "invoiceId">[]
  ): Promise<Invoice>
  updateInvoice(id: string, updates: Partial<Invoice>): Promise<void>
  deleteInvoice(id: string): Promise<void>
}
