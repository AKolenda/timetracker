import { formatCurrency } from "./format"
import {
  INVOICE_CURRENCY,
  formatWithCode,
  paymentAccounts,
  rateNote,
  type SecondaryTotal,
} from "./invoice-currency"

export interface EmailLineItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface EmailInvoiceData {
  invoiceNumber: string
  issueDate: string
  dueDate: string
  subtotal: number
  tax: number
  total: number
  notes: string
  lineItems: EmailLineItem[]
  client: {
    name: string
    email: string
  }
  business: {
    name: string
    email: string
    phone: string
    address: string
  }
  remittance?: {
    firstName?: string
    lastName?: string
    bankName?: string
    routingNumber?: string
    accountNumber?: string
    notes?: string
  }
  /** Converted total and second account, when the client is offered another currency. */
  secondary?: SecondaryTotal | null
  template: {
    subject: string
    greeting: string
    signature: string
    accentColor: string
  }
}

export function applyEmailTemplateVariables(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "")
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br/>")
}

export function buildSubject(data: EmailInvoiceData): string {
  const fallback = `Invoice ${data.invoiceNumber} from ${data.business.name}`
  const tpl = data.template.subject?.trim() || fallback
  return applyEmailTemplateVariables(tpl, {
    invoiceNumber: data.invoiceNumber,
    businessName: data.business.name,
    clientName: data.client.name,
    total: formatCurrency(data.total),
    dueDate: data.dueDate === data.issueDate ? "Due on receipt" : data.dueDate,
  })
}

export function buildEmailHtml(data: EmailInvoiceData): string {
  const accent = data.template.accentColor || "#111827"
  const dueLabel =
    data.dueDate === data.issueDate ? "Due on receipt" : data.dueDate
  const vars = {
    invoiceNumber: data.invoiceNumber,
    businessName: data.business.name,
    clientName: data.client.name,
    total: formatCurrency(data.total),
    dueDate: dueLabel,
  }

  const greetingHtml = data.template.greeting?.trim()
    ? `<div style="margin:24px 0;font-size:14px;line-height:1.6;color:#374151;">${nl2br(applyEmailTemplateVariables(data.template.greeting, vars))}</div>`
    : ""

  const signatureHtml = data.template.signature?.trim()
    ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.6;color:#374151;">${nl2br(applyEmailTemplateVariables(data.template.signature, vars))}</div>`
    : ""

  const itemsHtml = data.lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">
          ${escapeHtml(item.description)}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">
          ${item.quantity}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">
          ${formatCurrency(item.unitPrice)}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;font-weight:500;">
          ${formatCurrency(item.amount)}
        </td>
      </tr>`
    )
    .join("")

  const secondary = data.secondary ?? null
  const money = (amount: number) =>
    secondary ? formatWithCode(amount, INVOICE_CURRENCY) : formatCurrency(amount)

  const accounts = paymentAccounts(data.remittance ?? {}, data.total, secondary)
  const remittanceHtml = accounts.length
    ? `
      <div style="margin-top:24px;padding:16px;border:2px dashed #d1d5db;border-radius:8px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">
          ${accounts.length > 1 ? "Payment Options" : "Remittance Information"}
        </p>
        ${accounts
          .map((account, index) => {
            const heading = account.heading
              ? `<p style="margin:${index ? "16px" : "0"} 0 6px;font-size:14px;font-weight:700;">${escapeHtml(account.heading)}<span style="float:right;font-family:monospace;">${escapeHtml(account.amount)}</span></p>`
              : ""
            const lines = account.lines
              .map(
                (line) =>
                  `<p style="margin:4px 0;font-size:14px;"><strong>${escapeHtml(line.label)}:</strong> ${escapeHtml(line.value)}</p>`
              )
              .join("")
            const notes = account.notes
              ? `<p style="margin:4px 0;font-size:14px;">${escapeHtml(account.notes)}</p>`
              : ""
            return heading + lines + notes
          })
          .join("")}
      </div>`
    : ""

  const secondaryTotalHtml = secondary
    ? `
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#6b7280;">Total in ${escapeHtml(secondary.currency)}</td>
            <td style="padding:4px 0;font-size:14px;font-weight:600;text-align:right;font-family:monospace;">${formatWithCode(secondary.amount, secondary.currency)}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0 0 4px;font-size:11px;color:#9ca3af;text-align:right;">${escapeHtml(rateNote(secondary))}</td>
          </tr>`
    : ""

  return `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;padding:24px;">
      <div style="padding-bottom:16px;border-bottom:2px solid ${accent};">
        <h1 style="margin:0;font-size:20px;color:${accent};">${escapeHtml(data.business.name)}</h1>
        ${data.business.email ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${escapeHtml(data.business.email)}</p>` : ""}
        ${data.business.phone ? `<p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${escapeHtml(data.business.phone)}</p>` : ""}
      </div>

      ${greetingHtml}

      <div style="padding:16px 0;">
        <table style="width:100%;">
          <tr>
            <td style="vertical-align:top;">
              <p style="margin:0;font-size:12px;color:#6b7280;">Bill To</p>
              <p style="margin:4px 0 0;font-size:15px;font-weight:600;">${escapeHtml(data.client.name)}</p>
              ${data.client.email ? `<p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${escapeHtml(data.client.email)}</p>` : ""}
            </td>
            <td style="vertical-align:top;text-align:right;">
              <p style="margin:0;font-size:24px;font-weight:700;font-family:monospace;color:${accent};">${escapeHtml(data.invoiceNumber)}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">
                Issued: ${escapeHtml(data.issueDate)}<br/>
                Due: ${escapeHtml(dueLabel)}
              </p>
            </td>
          </tr>
        </table>
      </div>

      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:2px solid #e5e7eb;">Description</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;border-bottom:2px solid #e5e7eb;">Qty</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;border-bottom:2px solid #e5e7eb;">Rate</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;border-bottom:2px solid #e5e7eb;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <div style="margin-top:16px;margin-left:auto;width:${secondary ? 320 : 250}px;max-width:100%;">
        <table style="width:100%;">
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#6b7280;">Subtotal</td>
            <td style="padding:4px 0;font-size:14px;text-align:right;font-family:monospace;">${money(data.subtotal)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#6b7280;">Tax</td>
            <td style="padding:4px 0;font-size:14px;text-align:right;font-family:monospace;">${money(data.tax)}</td>
          </tr>
          <tr style="border-top:2px solid ${accent};">
            <td style="padding:8px 0;font-size:16px;font-weight:700;">Total</td>
            <td style="padding:8px 0;font-size:16px;font-weight:700;text-align:right;font-family:monospace;color:${accent};">${money(data.total)}</td>
          </tr>${secondaryTotalHtml}
        </table>
      </div>

      ${data.notes ? `<div style="margin-top:24px;padding:12px;background:#f9fafb;border-radius:6px;"><p style="margin:0;font-size:13px;color:#374151;white-space:pre-line;">${escapeHtml(data.notes)}</p></div>` : ""}

      ${remittanceHtml}

      ${signatureHtml}

      <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
        Generated by ${escapeHtml(data.business.name)}
      </p>
    </div>
  `
}
