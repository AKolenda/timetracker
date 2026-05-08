import { NextResponse } from "next/server"
import { Resend } from "resend"
import { supabase } from "@/lib/supabase"
import { formatCurrency } from "@/lib/format"

export async function POST(request: Request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is not configured" },
      { status: 500 }
    )
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  const { invoiceId } = await request.json()
  if (!invoiceId) {
    return NextResponse.json(
      { error: "invoiceId is required" },
      { status: 400 }
    )
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single()
  if (invErr || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
  }

  const { data: lineItems } = await supabase
    .from("invoice_line_items")
    .select("*")
    .eq("invoice_id", invoiceId)

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("*")
    .eq("id", invoice.client_id)
    .single()
  if (clientErr || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 })
  }

  const { data: settings } = await supabase
    .from("settings")
    .select("*")
    .eq("id", "default")
    .single()

  const recipientEmail = client.invoice_email || client.email
  if (!recipientEmail) {
    return NextResponse.json(
      { error: "Client has no email address configured" },
      { status: 400 }
    )
  }

  const fromEmail = settings?.business_email || "invoices@timetracker.app"
  const businessName = settings?.business_name || "TimeTracker"

  const itemsHtml = (lineItems ?? [])
    .map(
      (item: Record<string, unknown>) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">
          ${item.description}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">
          ${item.quantity}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">
          ${formatCurrency(Number(item.unit_price))}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;font-weight:500;">
          ${formatCurrency(Number(item.amount))}
        </td>
      </tr>`
    )
    .join("")

  let remittanceHtml = ""
  if (settings?.remittance_first_name || settings?.remittance_bank_name) {
    const lines: string[] = []
    if (settings.remittance_first_name || settings.remittance_last_name) {
      lines.push(
        `<strong>Pay to:</strong> ${settings.remittance_first_name} ${settings.remittance_last_name}`
      )
    }
    if (settings.remittance_bank_name)
      lines.push(`<strong>Bank:</strong> ${settings.remittance_bank_name}`)
    if (settings.remittance_routing_number)
      lines.push(
        `<strong>Routing:</strong> ${settings.remittance_routing_number}`
      )
    if (settings.remittance_account_number)
      lines.push(
        `<strong>Account:</strong> ${settings.remittance_account_number}`
      )
    if (settings.remittance_notes) lines.push(settings.remittance_notes)

    remittanceHtml = `
      <div style="margin-top:24px;padding:16px;border:2px dashed #d1d5db;border-radius:8px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">
          Remittance Information
        </p>
        ${lines.map((l) => `<p style="margin:4px 0;font-size:14px;">${l}</p>`).join("")}
      </div>`
  }

  const html = `
    <div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
      <div style="padding:24px 0;border-bottom:2px solid #111827;">
        <h1 style="margin:0;font-size:20px;">${businessName}</h1>
        ${settings?.business_email ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${settings.business_email}</p>` : ""}
        ${settings?.business_phone ? `<p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${settings.business_phone}</p>` : ""}
      </div>

      <div style="padding:24px 0;">
        <table style="width:100%;">
          <tr>
            <td style="vertical-align:top;">
              <p style="margin:0;font-size:12px;color:#6b7280;">Bill To</p>
              <p style="margin:4px 0 0;font-size:15px;font-weight:600;">${client.name}</p>
              ${client.email ? `<p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${client.email}</p>` : ""}
            </td>
            <td style="vertical-align:top;text-align:right;">
              <p style="margin:0;font-size:24px;font-weight:700;font-family:monospace;">${invoice.invoice_number}</p>
              <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">
                Issued: ${invoice.issue_date}<br/>
                Due: ${invoice.due_date}
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
            <td style="padding:4px 0;font-size:14px;text-align:right;font-family:monospace;">${formatCurrency(Number(invoice.subtotal))}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:14px;color:#6b7280;">Tax</td>
            <td style="padding:4px 0;font-size:14px;text-align:right;font-family:monospace;">${formatCurrency(Number(invoice.tax))}</td>
          </tr>
          <tr style="border-top:2px solid #111827;">
            <td style="padding:8px 0;font-size:16px;font-weight:700;">Total</td>
            <td style="padding:8px 0;font-size:16px;font-weight:700;text-align:right;font-family:monospace;">${formatCurrency(Number(invoice.total))}</td>
          </tr>
        </table>
      </div>

      ${invoice.notes ? `<div style="margin-top:24px;padding:12px;background:#f9fafb;border-radius:6px;"><p style="margin:0;font-size:13px;color:#6b7280;">${invoice.notes}</p></div>` : ""}

      ${remittanceHtml}

      <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;">
        Generated by ${businessName}
      </p>
    </div>
  `

  try {
    const { error } = await resend.emails.send({
      from: `${businessName} <${fromEmail}>`,
      to: recipientEmail,
      subject: `Invoice ${invoice.invoice_number} from ${businessName}`,
      html,
    })
    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    await supabase
      .from("invoices")
      .update({ status: "sent" })
      .eq("id", invoiceId)

    await supabase
      .from("clients")
      .update({ last_invoice_sent: new Date().toISOString() })
      .eq("id", invoice.client_id)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
