import { formatCurrency } from "./format"

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
  template: {
    subject: string
    greeting: string
    signature: string
    accentColor: string
  }
}

function applyVars(
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
  return applyVars(tpl, {
    invoiceNumber: data.invoiceNumber,
    businessName: data.business.name,
    clientName: data.client.name,
    total: formatCurrency(data.total),
    dueDate: data.dueDate,
  })
}

export function buildEmailHtml(data: EmailInvoiceData): string {
  const accent = data.template.accentColor || "#111827"
  const vars = {
    invoiceNumber: data.invoiceNumber,
    businessName: data.business.name,
    clientName: data.client.name,
    total: formatCurrency(data.total),
    dueDate: data.dueDate,
  }

  const greetingHtml = data.template.greeting?.trim()
    ? `<div style="margin:24px 0;font-size:14px;line-height:1.6;color:#374151;">${nl2br(applyVars(data.template.greeting, vars))}</div>`
    : ""

  const signatureHtml = data.template.signature?.trim()
    ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.6;color:#374151;">${nl2br(applyVars(data.template.signature, vars))}</div>`
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

  let remittanceHtml = ""
  const r = data.remittance
  if (r && (r.firstName || r.bankName)) {
    const lines: string[] = []
    if (r.firstName || r.lastName)
      lines.push(`<strong>Pay to:</strong> ${escapeHtml(`${r.firstName ?? ""} ${r.lastName ?? ""}`.trim())}`)
    if (r.bankName)
      lines.push(`<strong>Bank:</strong> ${escapeHtml(r.bankName)}`)
    if (r.routingNumber)
      lines.push(`<strong>Routing:</strong> ${escapeHtml(r.routingNumber)}`)
    if (r.accountNumber)
      lines.push(`<strong>Account:</strong> ${escapeHtml(r.accountNumber)}`)
    if (r.notes) lines.push(escapeHtml(r.notes))

    remittanceHtml = `
      <div style="margin-top:24px;padding:16px;border:2px dashed #d1d5db;border-radius:8px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">
          Remittance Information
        </p>
        ${lines.map((l) => `<p style="margin:4px 0;font-size:14px;">${l}</p>`).join("")}
      </div>`
  }

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
                Due: ${escapeHtml(data.dueDate)}
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

      <div style="margin-top:16px;margin-left:auto;width:250px;">
        <table style="width:100%;">
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#6b7280;">Subtotal</td>
            <td style="padding:4px 0;font-size:14px;text-align:right;font-family:monospace;">${formatCurrency(data.subtotal)}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#6b7280;">Tax</td>
            <td style="padding:4px 0;font-size:14px;text-align:right;font-family:monospace;">${formatCurrency(data.tax)}</td>
          </tr>
          <tr style="border-top:2px solid ${accent};">
            <td style="padding:8px 0;font-size:16px;font-weight:700;">Total</td>
            <td style="padding:8px 0;font-size:16px;font-weight:700;text-align:right;font-family:monospace;color:${accent};">${formatCurrency(data.total)}</td>
          </tr>
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
