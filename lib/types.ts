import type { WeekendSendRule } from "./invoice-schedule"
import type { AgentTimeSourceInterval } from "./agent-time"

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
  /** Show the secondary payment account and converted total on this client's invoices. */
  showSecondaryCurrency?: boolean
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
  /** Agent Time folders (e.g. "Ascend") whose time imports into this project. */
  agentFolders?: string[]
  createdAt: string
}

export interface TimeEntry {
  agentTimeTitleStatus?: "pending" | "failed" | null
  agentTimeSources?: AgentTimeSourceInterval[]
  id: string
  projectId: string
  description: string
  startTime: string
  endTime: string | null
  duration: number
  billable: boolean
  /** Share of the duration charged; 1 when unset. */
  billFactor?: number
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
  id: string
  projectId: string
  description: string
  startTime: string
  billable: boolean
  pausedAt?: string | null
  accumulatedPause?: number
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
  /** Where a scheduled invoice email that lands on a weekend goes instead. */
  invoiceWeekendRule: WeekendSendRule
  displayCurrency: string
  /** Optional second bank account offered on invoices, in a currency other than USD. */
  secondaryRemittance?: SecondaryRemittance
  agentTimeMaxMinutes?: number | null
  agentTimeHosts?: string[]
  agentTimeHostLabels?: Record<string, string>
  /** Billing factor per chat, keyed by conversationKey. */
  agentTimeChatBillFactors?: Record<string, number>
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
  /** Exchange rate locked when the invoice was issued, for the secondary currency. */
  fxCurrency?: string | null
  fxRate?: number | null
  fxRateDate?: string | null
  createdAt: string
}

export interface SecondaryRemittance {
  /** ISO code such as "AUD"; empty when no second account is offered. */
  currency: string
  accountName: string
  bankName: string
  /** Routing number, BSB, sort code, or equivalent. */
  routingNumber: string
  accountNumber: string
  notes: string
}

export const emptySecondaryRemittance: SecondaryRemittance = {
  currency: "",
  accountName: "",
  bankName: "",
  routingNumber: "",
  accountNumber: "",
  notes: "",
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
  activeTimers: ActiveTimer[]
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
  invoiceWeekendRule: "monday",
  displayCurrency: "",
  secondaryRemittance: emptySecondaryRemittance,
}
