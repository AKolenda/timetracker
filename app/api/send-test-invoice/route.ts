import { NextResponse } from "next/server"
import { Resend } from "resend"
import { supabase } from "@/lib/supabase"
import { buildEmailHtml, buildSubject, type EmailInvoiceData } from "@/lib/email-template"

interface TestEmailBody {
  to?: string
  from?: string
  template?: {
    subject?: string
    greeting?: string
    signature?: string
    accentColor?: string
  }
}

export async function POST(request: Request) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is not configured. Save your key first." },
      { status: 500 }
    )
  }

  let body: TestEmailBody = {}
  try {
    body = await request.json()
  } catch {}

  const to = body.to?.trim()
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json(
      { error: "Provide a valid 'to' email address" },
      { status: 400 }
    )
  }

  const { data: settings } = await supabase
    .from("settings")
    .select("*")
    .eq("id", "default")
    .single()

  const businessName = settings?.business_name || "TimeTracker"
  const businessEmail = settings?.business_email || ""
  const businessPhone = settings?.business_phone || ""
  const fromAddress = body.from?.trim() || "invoices@resend.dev"

  const template = {
    subject:
      body.template?.subject ??
      settings?.email_subject ??
      "Invoice {{invoiceNumber}} from {{businessName}}",
    greeting:
      body.template?.greeting ??
      settings?.email_greeting ??
      "Hi {{clientName}},\n\nPlease find your invoice below. Let me know if you have any questions.",
    signature:
      body.template?.signature ??
      settings?.email_signature ??
      "Thanks,\n{{businessName}}",
    accentColor:
      body.template?.accentColor ?? settings?.email_accent_color ?? "#111827",
  }

  const data: EmailInvoiceData = {
    invoiceNumber: `${settings?.invoice_prefix ?? "INV-"}TEST`,
    issueDate: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    dueDate: new Date(Date.now() + 30 * 86400_000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    subtotal: 1275,
    tax: 0,
    total: 1275,
    notes:
      "This is a test invoice sent from the TimeTracker Email Integration setup. No payment is required.",
    lineItems: [
      {
        description: "Sample Project: Discovery & wireframes",
        quantity: 3.5,
        unitPrice: 150,
        amount: 525,
      },
      {
        description: "Sample Project: Implementation",
        quantity: 5,
        unitPrice: 150,
        amount: 750,
      },
    ],
    client: {
      name: "Test Recipient",
      email: to,
    },
    business: {
      name: businessName,
      email: businessEmail,
      phone: businessPhone,
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
    template,
  }

  const html = buildEmailHtml(data)
  const subject = buildSubject(data)

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { data: sent, error } = await resend.emails.send({
      from: `${businessName} <${fromAddress}>`,
      to,
      subject: `[TEST] ${subject}`,
      html,
    })
    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Resend rejected the request" },
        { status: 500 }
      )
    }
    return NextResponse.json({ success: true, id: sent?.id ?? null })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
