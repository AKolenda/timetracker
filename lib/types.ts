export interface Client {
  id: string
  name: string
  email: string
  phone: string
  address: string
  color: string
  invoiceEmail: string
  invoiceScheduleWeeks: number | null
  invoiceScheduleAnchor: string | null
  invoiceScheduleEnabled: boolean
  invoiceScheduleAutoSend: boolean
  lastInvoiceSent: string | null
  createdAt: string
}

export interface Project {
  id: string
  clientId: string
  name: string
  rate: number
  currency: string
  status: "active" | "completed" | "on-hold"
  color: string
  createdAt: string
}

export interface TimeEntry {
  id: string
  projectId: string
  description: string
  startTime: string
  endTime: string | null
  duration: number
  billable: boolean
  date: string
}

export interface Expense {
  id: string
  projectId: string
  description: string
  amount: number
  category: string
  date: string
  notes: string
  invoiced: boolean
}

export interface ActiveTimer {
  projectId: string
  description: string
  startTime: string
  billable: boolean
}

export interface Settings {
  id: string
  businessName: string
  businessEmail: string
  businessPhone: string
  businessAddress: string
  remittanceFirstName: string
  remittanceLastName: string
  remittanceBankName: string
  remittanceRoutingNumber: string
  remittanceAccountNumber: string
  remittanceNotes: string
  invoicePrefix: string
  nextInvoiceNumber: number
  payoutCurrency: string
  payoutMinAmount: number
  payoutNotes: string
  emailSubject: string
  emailGreeting: string
  emailSignature: string
  emailAccentColor: string
  emailFromAddress: string
  timezone: string
  defaultInvoiceDueDays: number
}

export interface Invoice {
  id: string
  invoiceNumber: string
  clientId: string
  status: "draft" | "sent" | "paid" | "overdue"
  issueDate: string
  dueDate: string
  subtotal: number
  tax: number
  total: number
  notes: string
  lineItems: InvoiceLineItem[]
  createdAt: string
}

export interface InvoiceLineItem {
  id: string
  invoiceId: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  type: "time" | "expense"
  sourceId: string | null
}

export interface AppData {
  clients: Client[]
  projects: Project[]
  timeEntries: TimeEntry[]
  expenses: Expense[]
  invoices: Invoice[]
  settings: Settings
  activeTimer: ActiveTimer | null
}

export const defaultSettings: Settings = {
  id: "default",
  businessName: "",
  businessEmail: "",
  businessPhone: "",
  businessAddress: "",
  remittanceFirstName: "",
  remittanceLastName: "",
  remittanceBankName: "",
  remittanceRoutingNumber: "",
  remittanceAccountNumber: "",
  remittanceNotes: "",
  invoicePrefix: "INV-",
  nextInvoiceNumber: 1001,
  payoutCurrency: "USD",
  payoutMinAmount: 50,
  payoutNotes: "",
  emailSubject: "Invoice {{invoiceNumber}} from {{businessName}}",
  emailGreeting: "Hi {{clientName}},\n\nPlease find your invoice below. Let me know if you have any questions.",
  emailSignature: "Thanks,\n{{businessName}}",
  emailAccentColor: "#111827",
  emailFromAddress: "",
  timezone: "",
  defaultInvoiceDueDays: 30,
}
