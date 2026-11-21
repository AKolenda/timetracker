import { format, parseISO } from "date-fns"

import { formatCurrency } from "./format.ts"
import {
  INVOICE_CURRENCY,
  formatWithCode,
  paymentAccounts,
  rateNote,
  type PaymentAccount,
  type PrimaryRemittance,
  type SecondaryTotal,
} from "./invoice-currency.ts"
import { gstNumberLine, gstTaxLabel, type InvoiceGst } from "./invoice-gst.ts"

/** Everything an invoice prints, whatever it is drawn with. */
export interface InvoiceDocumentInput {
  invoiceNumber: string
  /** YYYY-MM-DD, or text that is printed as given. */
  issueDate: string
  dueDate: string
  subtotal: number
  tax: number
  total: number
  notes: string
  lineItems: Array<{
    description: string
    quantity: number
    unitPrice: number
    amount: number
    type?: "time" | "expense"
  }>
  business: { name: string; email?: string; phone?: string; address?: string }
  client: { name: string; email?: string; address?: string }
  gst: InvoiceGst | null
  secondary: SecondaryTotal | null
  remittance: PrimaryRemittance
}

export interface InvoiceDocumentRow {
  label: string
  value: string
}

/**
 * The receipt-style invoice: a centred header, the amount due, a box each for the client
 * and the invoice, the line items, the totals, and one box per payment account.
 */
export interface InvoiceDocument {
  business: { name: string; contact: string; address: string }
  amount: string
  amountNote: string
  client: { name: string; lines: string[] }
  invoice: { number: string; lines: string[] }
  items: Array<{ description: string; detail: string; amount: string }>
  totals: InvoiceDocumentRow[]
  total: InvoiceDocumentRow
  converted: (InvoiceDocumentRow & { note: string }) | null
  notes: string
  accounts: PaymentAccount[]
}

export function formatInvoiceDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value
  const date = parseISO(value)
  return Number.isNaN(date.getTime()) ? value : format(date, "MMM d, yyyy")
}

function quantity(value: number): string {
  return String(Math.round(Number(value) * 100) / 100)
}

export function buildInvoiceDocument(input: InvoiceDocumentInput): InvoiceDocument {
  const { secondary } = input
  const money = (amount: number) =>
    secondary ? formatWithCode(amount, INVOICE_CURRENCY) : formatCurrency(amount)
  const dueOnReceipt = input.dueDate === input.issueDate
  const due = dueOnReceipt ? "due on receipt" : `due ${formatInvoiceDate(input.dueDate)}`
  const gstNumber = gstNumberLine(input.gst)

  return {
    business: {
      name: input.business.name,
      contact: [input.business.email, input.business.phone, gstNumber]
        .filter(Boolean)
        .join(" · "),
      address: input.business.address ?? "",
    },
    amount: money(input.total),
    amountNote: secondary
      ? `or ${formatWithCode(secondary.amount, secondary.currency)} · ${due}`
      : due.charAt(0).toUpperCase() + due.slice(1),
    client: {
      name: input.client.name,
      lines: [input.client.email, input.client.address].filter(
        (line): line is string => !!line
      ),
    },
    invoice: {
      number: input.invoiceNumber,
      lines: [
        `Issued ${formatInvoiceDate(input.issueDate)}`,
        dueOnReceipt ? "Due on receipt" : `Due ${formatInvoiceDate(input.dueDate)}`,
      ],
    },
    items: input.lineItems.map((item) => ({
      description: item.description,
      detail:
        item.type === "expense" && Number(item.quantity) === 1
          ? ""
          : `${quantity(item.quantity)}${item.type === "expense" ? "" : " h"} × ${formatCurrency(item.unitPrice)}`,
      amount: formatCurrency(item.amount),
    })),
    totals: [
      { label: "Subtotal", value: money(input.subtotal) },
      { label: gstTaxLabel(input.gst, input.tax), value: money(input.tax) },
    ],
    total: { label: "Total", value: money(input.total) },
    converted: secondary
      ? {
          label: `Total in ${secondary.currency}`,
          value: formatWithCode(secondary.amount, secondary.currency),
          note: rateNote(secondary),
        }
      : null,
    notes: input.notes.trim(),
    accounts: paymentAccounts(input.remittance, input.total, secondary),
  }
}
