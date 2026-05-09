import { NextResponse } from "next/server"
import { Resend } from "resend"
import { supabase } from "@/lib/supabase"
import { buildEmailHtml, buildSubject, type EmailInvoiceData } from "@/lib/email-template"

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

  const fromAddress =
    settings?.email_from_address || settings?.business_email || "invoices@resend.dev"
  const businessName = settings?.business_name || "TimeTracker"

  const data: EmailInvoiceData = {
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    subtotal: Number(invoice.subtotal),
    tax: Number(invoice.tax),
    total: Number(invoice.total),
    notes: invoice.notes ?? "",
    lineItems: (lineItems ?? []).map((item) => ({
      description: String(item.description),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      amount: Number(item.amount),
    })),
    client: {
      name: client.name,
      email: recipientEmail,
    },
    business: {
      name: businessName,
      email: settings?.business_email ?? "",
      phone: settings?.business_phone ?? "",
      address: settings?.business_address ?? "",
    },
    remittance: {
      firstName: settings?.remittance_first_name,
      lastName: settings?.remittance_last_name,
      bankName: settings?.remittance_bank_name,
      routingNumber: settings?.remittance_routing_number,
      accountNumber: settings?.remittance_account_number,
      notes: settings?.remittance_notes,
    },
    template: {
      subject:
        settings?.email_subject || "Invoice {{invoiceNumber}} from {{businessName}}",
      greeting:
        settings?.email_greeting ||
        "Hi {{clientName}},\n\nPlease find your invoice below.",
      signature: settings?.email_signature || "Thanks,\n{{businessName}}",
      accentColor: settings?.email_accent_color || "#111827",
    },
  }

  const html = buildEmailHtml(data)
  const subject = buildSubject(data)

  try {
    const { error } = await resend.emails.send({
      from: `${businessName} <${fromAddress}>`,
      to: recipientEmail,
      subject,
      html,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
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
