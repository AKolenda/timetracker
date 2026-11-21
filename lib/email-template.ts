import { formatCurrency } from "./format"
import type { SecondaryTotal } from "./invoice-currency"
import { buildInvoiceDocument } from "./invoice-document"
import type { InvoiceGst } from "./invoice-gst"

export interface EmailLineItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
  type?: "time" | "expense"
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
    address?: string
  }
  /** GST registration and treatment printed on the invoice; null before registration. */
  gst?: InvoiceGst | null
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

const BOX =
  "background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;"
const MONO = "font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;"
const MUTED = "color:#6b7280;"

/** Two boxes side by side, or one full-width box. */
function boxRow(cells: string[]): string {
  if (cells.length === 1) return `<div style="${BOX}margin-top:10px;">${cells[0]}</div>`
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;border-spacing:0;margin-top:10px;">
      <tr>${cells
        .map(
          (cell, index) =>
            `<td class="tt-col" style="width:50%;vertical-align:top;${index ? "padding-left:5px;" : "padding-right:5px;"}"><div style="${BOX}">${cell}</div></td>`
        )
        .join("")}</tr>
    </table>`
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
    ? `<div style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#374151;">${nl2br(applyEmailTemplateVariables(data.template.greeting, vars))}</div>`
    : ""

  const signatureHtml = data.template.signature?.trim()
    ? `<div style="margin-top:20px;font-size:13px;line-height:1.6;color:#374151;">${nl2br(applyEmailTemplateVariables(data.template.signature, vars))}</div>`
    : ""

  const doc = buildInvoiceDocument({
    ...data,
    business: data.business,
    client: data.client,
    gst: data.gst ?? null,
    secondary: data.secondary ?? null,
    remittance: data.remittance ?? {},
  })

  const line = (text: string, style = "") =>
    `<p style="margin:2px 0 0;font-size:13px;${MUTED}${style}">${nl2br(text)}</p>`

  const itemsHtml = doc.items.length
    ? `<div style="${BOX}margin-top:10px;padding-top:4px;padding-bottom:4px;">${doc.items
        .map(
          (item, index) => `
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;${index ? "border-top:1px solid #e5e7eb;" : ""}">
          <tr>
            <td style="padding:10px 0;font-size:14px;vertical-align:top;">
              ${escapeHtml(item.description)}
              ${item.detail ? `<div style="margin-top:2px;font-size:12px;${MUTED}${MONO}">${escapeHtml(item.detail)}</div>` : ""}
            </td>
            <td style="padding:10px 0 10px 12px;font-size:14px;text-align:right;vertical-align:top;white-space:nowrap;${MONO}">${escapeHtml(item.amount)}</td>
          </tr>
        </table>`
        )
        .join("")}</div>`
    : ""

  const row = (label: string, value: string, valueStyle = "") => `
          <tr>
            <td style="padding:3px 0;font-size:13px;${MUTED}">${escapeHtml(label)}</td>
            <td style="padding:3px 0 3px 12px;font-size:13px;text-align:right;white-space:nowrap;${MONO}${valueStyle}">${escapeHtml(value)}</td>
          </tr>`

  const totalsHtml = `
      <div style="${BOX}margin-top:10px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
          ${doc.totals.map((r) => row(r.label, r.value)).join("")}
          <tr>
            <td style="padding:10px 0 2px;border-top:1px solid #e5e7eb;font-size:16px;font-weight:700;">${escapeHtml(doc.total.label)}</td>
            <td style="padding:10px 0 2px 12px;border-top:1px solid #e5e7eb;font-size:16px;font-weight:700;text-align:right;white-space:nowrap;${MONO}">${escapeHtml(doc.total.value)}</td>
          </tr>
          ${doc.converted ? row(doc.converted.label, doc.converted.value, "font-weight:600;") : ""}
        </table>
        ${doc.converted ? `<p style="margin:2px 0 0;font-size:11px;color:#9ca3af;text-align:right;">${escapeHtml(doc.converted.note)}</p>` : ""}
      </div>`

  const accountsHtml = doc.accounts.length
    ? boxRow(
        doc.accounts.map((account) => {
          const heading = account.heading
            ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:8px;"><tr><td style="font-size:14px;font-weight:700;">${escapeHtml(account.heading)}</td><td style="font-size:14px;font-weight:700;text-align:right;white-space:nowrap;${MONO}">${escapeHtml(account.amount)}</td></tr></table>`
            : ""
          const lines = account.lines
            .map(
              (l) =>
                `<tr><td style="padding:2px 12px 2px 0;font-size:13px;${MUTED}white-space:nowrap;vertical-align:top;">${escapeHtml(l.label)}</td><td style="padding:2px 0;font-size:13px;${l.mono ? MONO : ""}">${escapeHtml(l.value)}</td></tr>`
            )
            .join("")
          const notes = account.notes ? line(account.notes, "font-size:12px;margin-top:8px;") : ""
          return `${heading}<table role="presentation" cellpadding="0" cellspacing="0">${lines}</table>${notes}`
        })
      )
    : ""

  // Phones stack paired boxes; email apps that ignore <style> keep them side by side.
  return `
    <style>@media (max-width:480px){.tt-col{display:block!important;width:100%!important;padding:0!important}.tt-col+.tt-col{padding-top:10px!important}}</style>
    <div style="background:#f3f4f6;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
      <div style="max-width:540px;margin:0 auto;">
        ${greetingHtml}

        <div style="text-align:center;padding:4px 0 8px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#000;">${escapeHtml(doc.business.name)}</p>
          ${doc.business.contact ? line(doc.business.contact, "font-size:12px;") : ""}
          ${doc.business.address ? line(doc.business.address, "font-size:12px;") : ""}
        </div>

        <div style="background:${accent};border-radius:8px;padding:24px 16px;text-align:center;margin-top:2px;">
          <p style="margin:0;font-size:32px;font-weight:700;color:#ffffff;${MONO}">${escapeHtml(doc.amount)}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#d1d5db;">${escapeHtml(doc.amountNote)}</p>
        </div>

        ${boxRow([
          `<p style="margin:0;font-size:14px;font-weight:700;color:#000;">${escapeHtml(doc.client.name)}</p>${doc.client.lines.map((l) => line(l)).join("")}`,
          `<p style="margin:0;font-size:14px;font-weight:700;color:#000;${MONO}">${escapeHtml(doc.invoice.number)}</p>${doc.invoice.lines.map((l) => line(l)).join("")}`,
        ])}

        ${itemsHtml}
        ${totalsHtml}
        ${doc.notes ? `<div style="${BOX}margin-top:10px;font-size:13px;color:#374151;">${nl2br(doc.notes)}</div>` : ""}
        ${accountsHtml}

        ${signatureHtml}
      </div>
    </div>
  `
}
