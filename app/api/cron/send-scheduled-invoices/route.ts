import { NextResponse } from "next/server"
import { Resend } from "resend"
import { supabase } from "@/lib/supabase"
import { buildEmailHtml, buildSubject, type EmailInvoiceData } from "@/lib/email-template"

const ONE_DAY = 86_400_000

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * ONE_DAY)
    .toISOString()
    .slice(0, 10)
}

function isDue(
  anchor: string | null,
  weeks: number | null,
  lastSent: string | null,
  now: Date
): boolean {
  if (!weeks || weeks <= 0) return false
  const intervalMs = weeks * 7 * ONE_DAY

  if (lastSent) {
    return now.getTime() - new Date(lastSent).getTime() >= intervalMs
  }
  if (!anchor) return false
  return now.getTime() >= new Date(anchor).getTime()
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? ""
  const expected = process.env.CRON_SECRET
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is not configured" },
      { status: 500 }
    )
  }

  const { dryRun } = await request.json().catch(() => ({ dryRun: false }))
  const resend = new Resend(process.env.RESEND_API_KEY)
  const now = new Date()

  const { data: settings } = await supabase
    .from("settings")
    .select("*")
    .eq("id", "default")
    .single()

  const { data: clients, error: clientsErr } = await supabase
    .from("clients")
    .select("*")
    .eq("invoice_schedule_enabled", true)
  if (clientsErr) {
    return NextResponse.json({ error: clientsErr.message }, { status: 500 })
  }

  const businessName = settings?.business_name || "TimeTracker"
  const fromAddress =
    settings?.email_from_address || settings?.business_email || "invoices@resend.dev"

  const results: Array<{
    clientId: string
    clientName: string
    status: "sent" | "skipped" | "draft" | "error"
    invoiceNumber?: string
    reason?: string
  }> = []

  for (const client of clients ?? []) {
    if (
      !isDue(
        client.invoice_schedule_anchor as string | null,
        client.invoice_schedule_weeks as number | null,
        client.last_invoice_sent as string | null,
        now
      )
    ) {
      results.push({
        clientId: client.id,
        clientName: client.name,
        status: "skipped",
        reason: "Not due yet",
      })
      continue
    }

    const recipient = client.invoice_email || client.email
    if (!recipient) {
      results.push({
        clientId: client.id,
        clientName: client.name,
        status: "error",
        reason: "No email address",
      })
      continue
    }

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, rate")
      .eq("client_id", client.id)
    const projectIds = (projects ?? []).map((p) => p.id as string)
    if (projectIds.length === 0) {
      results.push({
        clientId: client.id,
        clientName: client.name,
        status: "skipped",
        reason: "No projects",
      })
      continue
    }
    const projectMap = new Map(
      (projects ?? []).map((p) => [
        p.id as string,
        { name: p.name as string, rate: Number(p.rate) },
      ])
    )

    const { data: timeEntries } = await supabase
      .from("time_entries")
      .select("*")
      .in("project_id", projectIds)
      .eq("billable", true)

    const { data: expenses } = await supabase
      .from("expenses")
      .select("*")
      .in("project_id", projectIds)
      .eq("invoiced", false)

    const sinceMs = client.last_invoice_sent
      ? new Date(client.last_invoice_sent as string).getTime()
      : 0

    const items: Array<{
      description: string
      quantity: number
      unit_price: number
      amount: number
      type: "time" | "expense"
      source_id: string
    }> = []

    for (const e of timeEntries ?? []) {
      const created = new Date(e.start_time as string).getTime()
      if (sinceMs && created <= sinceMs) continue
      const proj = projectMap.get(e.project_id as string)
      if (!proj) continue
      const hours = Number(e.duration) / 3600
      const amount = parseFloat((hours * proj.rate).toFixed(2))
      items.push({
        description: `${proj.name}: ${e.description || "Time entry"} (${(e.date as string).slice(5)})`,
        quantity: parseFloat(hours.toFixed(2)),
        unit_price: proj.rate,
        amount,
        type: "time",
        source_id: e.id as string,
      })
    }

    for (const ex of expenses ?? []) {
      const proj = projectMap.get(ex.project_id as string)
      if (!proj) continue
      items.push({
        description: `${proj.name}: ${ex.description}`,
        quantity: 1,
        unit_price: Number(ex.amount),
        amount: Number(ex.amount),
        type: "expense",
        source_id: ex.id as string,
      })
    }

    if (items.length === 0) {
      results.push({
        clientId: client.id,
        clientName: client.name,
        status: "skipped",
        reason: "Nothing to bill",
      })
      continue
    }

    const subtotal = items.reduce((s, i) => s + i.amount, 0)
    const total = subtotal
    const invoiceNumber = `${settings?.invoice_prefix ?? "INV-"}${settings?.next_invoice_number ?? 1}`
    const issueDate = todayIso()
    const dueDate = addDaysIso(issueDate, 30)

    if (dryRun) {
      results.push({
        clientId: client.id,
        clientName: client.name,
        status: "skipped",
        invoiceNumber,
        reason: `dry-run: ${items.length} items, ${subtotal.toFixed(2)}`,
      })
      continue
    }

    const { data: createdInv, error: createErr } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        client_id: client.id,
        status: "draft",
        issue_date: issueDate,
        due_date: dueDate,
        subtotal: parseFloat(subtotal.toFixed(2)),
        tax: 0,
        total: parseFloat(total.toFixed(2)),
        notes: "Scheduled invoice — generated automatically",
      })
      .select()
      .single()

    if (createErr || !createdInv) {
      results.push({
        clientId: client.id,
        clientName: client.name,
        status: "error",
        reason: createErr?.message ?? "Failed to create invoice",
      })
      continue
    }

    await supabase.from("invoice_line_items").insert(
      items.map((it) => ({ ...it, invoice_id: createdInv.id }))
    )

    await supabase
      .from("expenses")
      .update({ invoiced: true })
      .in(
        "id",
        items.filter((i) => i.type === "expense").map((i) => i.source_id)
      )

    await supabase
      .from("settings")
      .update({ next_invoice_number: (settings?.next_invoice_number ?? 1) + 1 })
      .eq("id", "default")

    if (!client.invoice_schedule_auto_send) {
      results.push({
        clientId: client.id,
        clientName: client.name,
        status: "draft",
        invoiceNumber,
      })
      continue
    }

    const emailData: EmailInvoiceData = {
      invoiceNumber,
      issueDate,
      dueDate,
      subtotal,
      tax: 0,
      total,
      notes: "Scheduled invoice — generated automatically",
      lineItems: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        amount: i.amount,
      })),
      client: { name: client.name, email: recipient },
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
        subject: settings?.email_subject || "Invoice {{invoiceNumber}}",
        greeting: settings?.email_greeting || "",
        signature: settings?.email_signature || "",
        accentColor: settings?.email_accent_color || "#111827",
      },
    }

    try {
      const { error: sendErr } = await resend.emails.send({
        from: `${businessName} <${fromAddress}>`,
        to: recipient,
        subject: buildSubject(emailData),
        html: buildEmailHtml(emailData),
      })
      if (sendErr) throw new Error(sendErr.message)

      await supabase
        .from("invoices")
        .update({ status: "sent" })
        .eq("id", createdInv.id)

      await supabase
        .from("clients")
        .update({ last_invoice_sent: now.toISOString() })
        .eq("id", client.id)

      results.push({
        clientId: client.id,
        clientName: client.name,
        status: "sent",
        invoiceNumber,
      })
    } catch (err) {
      results.push({
        clientId: client.id,
        clientName: client.name,
        status: "error",
        invoiceNumber,
        reason: err instanceof Error ? err.message : "Send failed",
      })
    }
  }

  return NextResponse.json({ ranAt: now.toISOString(), results })
}

export async function GET() {
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, invoice_schedule_weeks, invoice_schedule_anchor, invoice_schedule_enabled, invoice_schedule_auto_send, last_invoice_sent")
    .eq("invoice_schedule_enabled", true)

  const now = new Date()
  const upcoming = (clients ?? []).map((c) => {
    const weeks = c.invoice_schedule_weeks as number | null
    const anchor = c.invoice_schedule_anchor as string | null
    const lastSent = c.last_invoice_sent as string | null
    let nextRun: string | null = null
    if (weeks && weeks > 0) {
      if (lastSent) {
        nextRun = new Date(
          new Date(lastSent).getTime() + weeks * 7 * ONE_DAY
        ).toISOString()
      } else if (anchor) {
        nextRun = new Date(anchor).toISOString()
      }
    }
    return {
      clientId: c.id,
      clientName: c.name,
      weeks,
      anchor,
      autoSend: c.invoice_schedule_auto_send,
      lastSent,
      nextRun,
      due: nextRun ? now.getTime() >= new Date(nextRun).getTime() : false,
    }
  })

  return NextResponse.json({ now: now.toISOString(), upcoming })
}
