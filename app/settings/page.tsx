"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Eye, DollarSign, Key, CheckCircle2, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/page-header"
import { PaymentOptions, SecondaryTotalRow } from "@/components/invoice-payment-options"
import { useStore } from "@/lib/store"
import { formatCurrency } from "@/lib/format"
import {
  INVOICE_CURRENCY,
  formatWithCode,
  parseSecondaryRemittance,
  paymentAccounts,
  routingLabel,
  secondaryTotal,
} from "@/lib/invoice-currency"
import { useExchangeRate } from "@/lib/use-exchange-rate"
import {
  emptySecondaryRemittance,
  type SecondaryRemittance,
  type Settings,
} from "@/lib/types"
import { getBrowserTimezone, listTimezones } from "@/lib/datetime"

const CURRENCIES = [
  { value: "USD", label: "USD — United States Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
]

/** The fields the "Save general settings" button writes, normalized the way they are stored. */
function generalFields(s: Settings) {
  return {
    businessName: s.businessName,
    businessEmail: s.businessEmail,
    businessPhone: s.businessPhone,
    businessAddress: s.businessAddress,
    remittanceFirstName: s.remittanceFirstName,
    remittanceLastName: s.remittanceLastName,
    remittanceBankName: s.remittanceBankName,
    remittanceRoutingNumber: s.remittanceRoutingNumber,
    remittanceAccountNumber: s.remittanceAccountNumber,
    remittanceNotes: s.remittanceNotes,
    invoicePrefix: s.invoicePrefix,
    nextInvoiceNumber: s.nextInvoiceNumber,
    timezone: s.timezone,
    defaultInvoiceDueDays: s.defaultInvoiceDueDays,
    displayCurrency: s.displayCurrency === "none" ? "" : s.displayCurrency,
    agentTimeHosts: s.agentTimeHosts || [],
    agentTimeMaxMinutes: s.agentTimeMaxMinutes || null,
    agentTimeHostLabels: s.agentTimeHostLabels || {},
  }
}

/** The fields the "Save email format" button writes. */
function emailFormatFields(s: Settings) {
  return {
    emailSubject: s.emailSubject,
    emailGreeting: s.emailGreeting,
    emailSignature: s.emailSignature,
    emailAccentColor: s.emailAccentColor,
    emailFromAddress: s.emailFromAddress,
  }
}

const sameFields = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b)

/** "Unsaved changes" while the form differs from what is stored, "Saved" right after a save. */
function SaveStatus({ dirty, saved, className }: { dirty: boolean; saved: boolean; className?: string }) {
  return (
    <span aria-live="polite" className={cn("text-xs", dirty ? "text-warning-foreground" : "text-muted-foreground", className)}>
      {dirty ? (
        "Unsaved changes"
      ) : saved ? (
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 aria-hidden className="size-3.5 text-success-foreground" />
          Saved
        </span>
      ) : null}
    </span>
  )
}

/** A heading that groups the cards one save button covers. */
function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid gap-0.5 px-1">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

export default function SettingsPage() {
  const { data, updateSettings } = useStore()
  const [form, setForm] = useState({ ...data.settings })
  const [saving, setSaving] = useState(false)
  const [generalSaved, setGeneralSaved] = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailSaved, setEmailSaved] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [payoutOpen, setPayoutOpen] = useState(false)
  const [resendKey, setResendKey] = useState("")
  const [resendSaving, setResendSaving] = useState(false)
  const [resendStatus, setResendStatus] = useState<{
    configured: boolean
    masked: string | null
  }>({ configured: false, masked: null })
  const [testEmail, setTestEmail] = useState("")
  const [testSending, setTestSending] = useState(false)

  useEffect(() => {
    fetch("/api/set-resend-key")
      .then((r) => r.json())
      .then((d) =>
        setResendStatus({
          configured: !!d.configured,
          masked: d.masked ?? null,
        })
      )
      .catch(() => {})
  }, [])

  async function handleSendTest() {
    if (
      !testEmail.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.trim())
    ) {
      toast.error("Enter a valid recipient email")
      return
    }
    setTestSending(true)
    try {
      const res = await fetch("/api/send-test-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: testEmail.trim(),
          from:
            form.emailFromAddress ||
            form.businessEmail ||
            "invoices@resend.dev",
          template: {
            subject: form.emailSubject,
            greeting: form.emailGreeting,
            signature: form.emailSignature,
            accentColor: form.emailAccentColor,
          },
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Send failed")
      toast.success(`Test sent to ${testEmail.trim()}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send test")
    } finally {
      setTestSending(false)
    }
  }

  async function handleEmailFormatSave() {
    setEmailSaving(true)
    try {
      await updateSettings(emailFormatFields(form))
      setEmailSaved(true)
      toast.success("Email format saved")
    } catch {
      toast.error("Failed to save email format")
    } finally {
      setEmailSaving(false)
    }
  }

  async function handleSave() {
    // Only send the second account when it changed, so unrelated saves never touch it.
    const secondaryChanged =
      JSON.stringify(parseSecondaryRemittance(secondaryForm)) !==
      JSON.stringify(parseSecondaryRemittance(data.settings.secondaryRemittance))
    setSaving(true)
    try {
      await updateSettings({
        ...generalFields(form),
        ...(secondaryChanged
          ? { secondaryRemittance: parseSecondaryRemittance(secondaryForm) }
          : {}),
      })
      setGeneralSaved(true)
      toast.success("Settings saved")
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  async function handlePayoutSave() {
    try {
      await updateSettings({
        payoutCurrency: form.payoutCurrency,
        payoutMinAmount: form.payoutMinAmount,
        payoutNotes: form.payoutNotes,
      })
      toast.success("Payout threshold saved")
      setPayoutOpen(false)
    } catch {
      toast.error("Failed to save payout settings")
    }
  }

  async function handleResendSave() {
    if (!resendKey.trim()) {
      toast.error("Enter a valid API key")
      return
    }
    setResendSaving(true)
    try {
      const res = await fetch("/api/set-resend-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: resendKey.trim() }),
      })
      if (!res.ok) throw new Error()
      toast.success("Resend API key saved")
      setResendKey("")
      const status = await fetch("/api/set-resend-key").then((r) => r.json())
      setResendStatus({
        configured: !!status.configured,
        masked: status.masked ?? null,
      })
    } catch {
      toast.error("Failed to save API key")
    } finally {
      setResendSaving(false)
    }
  }

  async function handleResendDisconnect() {
    try {
      const res = await fetch("/api/set-resend-key", { method: "DELETE" })
      if (!res.ok) throw new Error()
      setResendStatus({ configured: false, masked: null })
      toast.success("Disconnected Resend")
    } catch {
      toast.error("Failed to disconnect")
    }
  }

  const senderName = form.businessName || "Your Name"
  const secondaryForm = form.secondaryRemittance ?? emptySecondaryRemittance
  function setSecondary(updates: Partial<SecondaryRemittance>) {
    setForm({ ...form, secondaryRemittance: { ...secondaryForm, ...updates } })
  }
  // The sample invoice shows the second account the way an opted-in client sees it.
  const { quote: sampleQuote } = useExchangeRate(
    INVOICE_CURRENCY,
    previewOpen && secondaryForm.currency ? secondaryForm.currency : null
  )
  const sampleSecondary = secondaryTotal(
    { total: 1289.99 },
    secondaryForm.currency || null,
    secondaryForm,
    sampleQuote
  )
  const sampleMoney = (amount: number) =>
    sampleSecondary
      ? formatWithCode(amount, INVOICE_CURRENCY)
      : formatCurrency(amount)
  const sampleAccounts = paymentAccounts(
    {
      firstName: form.remittanceFirstName,
      lastName: form.remittanceLastName,
      bankName: form.remittanceBankName,
      routingNumber: form.remittanceRoutingNumber,
      accountNumber: form.remittanceAccountNumber,
      notes: form.remittanceNotes,
    },
    1289.99,
    sampleSecondary
  )

  const browserTimezone = getBrowserTimezone()
  const timezoneValue = form.timezone || browserTimezone
  // Some browsers leave "UTC" out of their zone list; the saved or detected zone must still show.
  const timezoneOptions = useMemo(() => {
    const zones = listTimezones()
    return zones.includes(timezoneValue) ? zones : [timezoneValue, ...zones]
  }, [timezoneValue])

  const generalDirty =
    !sameFields(generalFields(form), generalFields(data.settings)) ||
    !sameFields(
      parseSecondaryRemittance(secondaryForm),
      parseSecondaryRemittance(data.settings.secondaryRemittance)
    )
  const emailDirty = !sameFields(
    emailFormatFields(form),
    emailFormatFields(data.settings)
  )

  return (
    <>
      <PageHeader
        title="Settings"
        currencyToggle={false}
        actions={
          <>
            <SaveStatus dirty={generalDirty} saved={generalSaved} />
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              data-testid="settings-save-general"
            >
              {saving ? "Saving..." : "Save general settings"}
            </Button>
          </>
        }
      />

      <div className="mx-auto grid w-full max-w-3xl gap-6 pb-6">
        <SectionHeading
          title="General"
          description="Your details, invoicing, payment accounts and Agent Time imports. Saved with “Save general settings” at the top."
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Your information</CardTitle>
            <CardDescription className="text-xs">
              Shown as the sender on every invoice.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="biz-name">Name / business name</Label>
                <Input
                  id="biz-name"
                  value={form.businessName}
                  onChange={(e) =>
                    setForm({ ...form, businessName: e.target.value })
                  }
                  placeholder="John Doe or Acme LLC"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="biz-email">Email</Label>
                <Input
                  id="biz-email"
                  type="email"
                  value={form.businessEmail}
                  onChange={(e) =>
                    setForm({ ...form, businessEmail: e.target.value })
                  }
                  placeholder="you@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="biz-phone">Phone</Label>
                <Input
                  id="biz-phone"
                  value={form.businessPhone}
                  onChange={(e) =>
                    setForm({ ...form, businessPhone: e.target.value })
                  }
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={timezoneValue}
                  onValueChange={(v) => setForm({ ...form, timezone: v })}
                >
                  <SelectTrigger id="timezone" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {timezoneOptions.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              The timezone dates your time entries. Detected browser timezone:{" "}
              <code className="font-mono">{browserTimezone}</code>.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="biz-address">Address</Label>
              <Textarea
                id="biz-address"
                value={form.businessAddress}
                onChange={(e) =>
                  setForm({ ...form, businessAddress: e.target.value })
                }
                placeholder="123 Main St&#10;City, State ZIP"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Invoicing</CardTitle>
            <CardDescription className="text-xs">
              Numbering and due dates for new invoices.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="inv-prefix">Invoice prefix</Label>
                <Input
                  id="inv-prefix"
                  value={form.invoicePrefix}
                  onChange={(e) =>
                    setForm({ ...form, invoicePrefix: e.target.value })
                  }
                  placeholder="INV-"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv-next">Next invoice #</Label>
                <Input
                  id="inv-next"
                  type="number"
                  min="1"
                  value={form.nextInvoiceNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      nextInvoiceNumber: parseInt(e.target.value) || 1,
                    })
                  }
                  className="tabular-nums"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="net-due">Net due</Label>
              <div className="flex gap-2">
                <Select
                  value={(() => {
                    const presets = [0, 7, 15, 30, 45, 60, 90]
                    return presets.includes(form.defaultInvoiceDueDays)
                      ? String(form.defaultInvoiceDueDays)
                      : "custom"
                  })()}
                  onValueChange={(v) => {
                    if (v === "custom") return
                    setForm({
                      ...form,
                      defaultInvoiceDueDays: parseInt(v),
                    })
                  }}
                >
                  <SelectTrigger id="net-due" className="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Due on receipt</SelectItem>
                    <SelectItem value="7">Net 7</SelectItem>
                    <SelectItem value="15">Net 15</SelectItem>
                    <SelectItem value="30">Net 30</SelectItem>
                    <SelectItem value="45">Net 45</SelectItem>
                    <SelectItem value="60">Net 60</SelectItem>
                    <SelectItem value="90">Net 90</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  aria-label="Net due days"
                  value={form.defaultInvoiceDueDays}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      defaultInvoiceDueDays: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-20 tabular-nums"
                />
                <span className="self-center text-xs text-muted-foreground">
                  days
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Default due-date offset when creating a new invoice. 0 days
                means due on receipt.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="display-currency">Secondary estimate currency</Label>
              <Select
                value={form.displayCurrency || "none"}
                onValueChange={(v) => setForm({ ...form, displayCurrency: v })}
              >
                <SelectTrigger id="display-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {CURRENCIES.filter((c) => c.value !== "USD").map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Adds an ≈ converted line under the dashboard revenue totals.
                The USD/CAD switch in the page header is the main currency
                setting; this estimate is hidden when it matches that choice.
                Rate refreshes daily from frankfurter.app.
              </p>
            </div>
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye className="size-4" data-icon="inline-start" />
                Preview invoice email
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPayoutOpen(true)}
              >
                <DollarSign className="size-4" data-icon="inline-start" />
                Payout threshold
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Remittance information
            </CardTitle>
            <CardDescription className="text-xs">
              This information appears on your invoices so clients know how to
              pay you.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
              Primary account · {INVOICE_CURRENCY}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="rem-first">First name</Label>
                <Input
                  id="rem-first"
                  value={form.remittanceFirstName}
                  onChange={(e) =>
                    setForm({ ...form, remittanceFirstName: e.target.value })
                  }
                  placeholder="John"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rem-last">Last name</Label>
                <Input
                  id="rem-last"
                  value={form.remittanceLastName}
                  onChange={(e) =>
                    setForm({ ...form, remittanceLastName: e.target.value })
                  }
                  placeholder="Doe"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="rem-bank">Bank name</Label>
                <Input
                  id="rem-bank"
                  value={form.remittanceBankName}
                  onChange={(e) =>
                    setForm({ ...form, remittanceBankName: e.target.value })
                  }
                  placeholder="Chase Bank"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rem-routing">Routing number</Label>
                <Input
                  id="rem-routing"
                  value={form.remittanceRoutingNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      remittanceRoutingNumber: e.target.value,
                    })
                  }
                  placeholder="021000021"
                  className="tabular-nums"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rem-account">Account number</Label>
                <Input
                  id="rem-account"
                  value={form.remittanceAccountNumber}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      remittanceAccountNumber: e.target.value,
                    })
                  }
                  placeholder="123456789"
                  className="tabular-nums"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rem-notes">Additional notes</Label>
              <Textarea
                id="rem-notes"
                value={form.remittanceNotes}
                onChange={(e) =>
                  setForm({ ...form, remittanceNotes: e.target.value })
                }
                placeholder="Wire transfer instructions, Zelle info, etc."
                rows={3}
              />
            </div>
            <Separator />
            <div className="grid gap-1">
              <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Second account · optional
              </p>
              <p className="text-xs text-muted-foreground">
                Clients you turn this on for see their total in both currencies
                and can pay into either account. The converted amount uses the
                exchange rate on the day the invoice is sent.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="rem2-currency">Currency</Label>
                <Select
                  value={secondaryForm.currency || "none"}
                  onValueChange={(v) =>
                    setSecondary({ currency: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger id="rem2-currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      None ({INVOICE_CURRENCY} only)
                    </SelectItem>
                    {CURRENCIES.filter((c) => c.value !== INVOICE_CURRENCY).map(
                      (c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {secondaryForm.currency && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="rem2-name">Account name</Label>
                    <Input
                      id="rem2-name"
                      value={secondaryForm.accountName}
                      onChange={(e) =>
                        setSecondary({ accountName: e.target.value })
                      }
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rem2-bank">Bank name</Label>
                    <Input
                      id="rem2-bank"
                      value={secondaryForm.bankName}
                      onChange={(e) =>
                        setSecondary({ bankName: e.target.value })
                      }
                      placeholder={
                        secondaryForm.currency === "AUD" ? "Wise" : "Bank"
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rem2-routing">
                      {routingLabel(secondaryForm.currency)}
                    </Label>
                    <Input
                      id="rem2-routing"
                      value={secondaryForm.routingNumber}
                      onChange={(e) =>
                        setSecondary({ routingNumber: e.target.value })
                      }
                      placeholder={
                        secondaryForm.currency === "AUD" ? "062-000" : ""
                      }
                      className="tabular-nums"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="rem2-account">Account number</Label>
                    <Input
                      id="rem2-account"
                      value={secondaryForm.accountNumber}
                      onChange={(e) =>
                        setSecondary({ accountNumber: e.target.value })
                      }
                      placeholder="12345678"
                      className="tabular-nums"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="rem2-notes">Additional notes</Label>
                  <Textarea
                    id="rem2-notes"
                    value={secondaryForm.notes}
                    onChange={(e) => setSecondary({ notes: e.target.value })}
                    placeholder="SWIFT code, PayID, or other instructions"
                    rows={2}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Turn it on per client under Clients → Edit.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Agent Time integrations
            </CardTitle>
            <CardDescription className="text-xs">
              Machines the tracker imports agentic coding time from.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="agent-time">Collector URLs (one per line)</Label>
              <Textarea
                id="agent-time"
                value={(form.agentTimeHosts || []).join("\n")}
                onChange={(e) =>
                  setForm({ ...form, agentTimeHosts: e.target.value.split("\n") })
                }
                placeholder="http://your-machine:8080/api/data"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Add each machine running Agent Time. Overlapping activity is
                merged so time is not counted twice.
              </p>
            </div>
            {(form.agentTimeHosts || []).some((url) => url.trim()) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {(form.agentTimeHosts || [])
                  .filter((url) => url.trim())
                  .map((url, index) => (
                    <div
                      key={index}
                      className="grid min-w-0 gap-1.5 rounded-md border p-3"
                    >
                      <Label htmlFor={`machine-label-${index}`}>
                        Machine label
                      </Label>
                      <Input
                        id={`machine-label-${index}`}
                        value={form.agentTimeHostLabels?.[url.trim()] || ""}
                        placeholder="e.g. Work laptop or Coding VM"
                        onChange={(e) =>
                          setForm({
                            ...form,
                            agentTimeHostLabels: {
                              ...form.agentTimeHostLabels,
                              [url.trim()]: e.target.value,
                            },
                          })
                        }
                      />
                      <p className="font-mono text-xs break-all text-muted-foreground">
                        {url.trim()}
                      </p>
                    </div>
                  ))}
              </div>
            )}
            <div className="grid gap-2 sm:max-w-xs">
              <Label htmlFor="agent-time-max">
                Maximum entry length (minutes)
              </Label>
              <Input
                id="agent-time-max"
                type="number"
                min={1}
                max={1440}
                step={1}
                value={form.agentTimeMaxMinutes ?? ""}
                placeholder="No limit"
                className="tabular-nums"
                onChange={(e) =>
                  setForm({
                    ...form,
                    agentTimeMaxMinutes: e.target.value
                      ? Math.max(
                          1,
                          Math.min(1440, Math.round(Number(e.target.value)))
                        )
                      : null,
                  })
                }
              />
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              Split new Agent Time imports into intervals with titles based on
              each interval’s activity. Leave blank for no limit. Saved entries
              are unchanged.
            </p>
          </CardContent>
        </Card>

        <SectionHeading
          title="Email"
          description="Sending invoices by email. Each card here saves on its own."
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Email integration</CardTitle>
            <CardDescription className="text-xs">
              Connect Resend to send invoices directly to your clients.
            </CardDescription>
            <CardAction>
              {resendStatus.configured ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success-foreground">
                  <CheckCircle2 aria-hidden className="size-3.5" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Not connected
                </span>
              )}
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            {resendStatus.configured ? (
              <div className="grid gap-3">
                <div className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Key aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono text-sm">
                      {resendStatus.masked ?? "re_••••"}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResendDisconnect}
                  >
                    <Trash2 className="size-4" data-icon="inline-start" />
                    Disconnect
                  </Button>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="resend-key">Replace key</Label>
                  <div className="flex gap-2">
                    <Input
                      id="resend-key"
                      type="password"
                      value={resendKey}
                      onChange={(e) => setResendKey(e.target.value)}
                      placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
                      className="min-w-0 flex-1 font-mono text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={handleResendSave}
                      disabled={resendSaving || !resendKey.trim()}
                      className="self-center"
                    >
                      {resendSaving ? "Saving..." : "Save new key"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="resend-key">Resend API key</Label>
                <div className="flex gap-2">
                  <Input
                    id="resend-key"
                    type="password"
                    value={resendKey}
                    onChange={(e) => setResendKey(e.target.value)}
                    placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="min-w-0 flex-1 font-mono text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleResendSave}
                    disabled={resendSaving || !resendKey.trim()}
                    className="self-center"
                  >
                    <Key className="size-4" data-icon="inline-start" />
                    {resendSaving ? "Saving..." : "Save key"}
                  </Button>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Saves right away. Your API key is stored server-side as an
              environment variable and never exposed to the browser.
            </p>
            {resendStatus.configured && (
              <>
                <Separator />
                <div className="grid gap-2">
                  <Label htmlFor="test-email">Send a test invoice</Label>
                  <div className="flex gap-2">
                    <Input
                      id="test-email"
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="min-w-0 flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSendTest}
                      disabled={testSending || !testEmail.trim()}
                      className="self-center"
                    >
                      {testSending ? "Sending..." : "Send test"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sends a sample invoice using your saved email format.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Email format</CardTitle>
            <CardDescription className="text-xs">
              Customize the subject, greeting, and signature. Variables:{" "}
              <code className="font-mono">{"{{invoiceNumber}}"}</code>{" "}
              <code className="font-mono">{"{{businessName}}"}</code>{" "}
              <code className="font-mono">{"{{clientName}}"}</code>{" "}
              <code className="font-mono">{"{{total}}"}</code>{" "}
              <code className="font-mono">{"{{dueDate}}"}</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email-from">From address</Label>
              <Input
                id="email-from"
                value={form.emailFromAddress}
                onChange={(e) =>
                  setForm({ ...form, emailFromAddress: e.target.value })
                }
                placeholder="invoices@yourdomain.com"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Must be on a domain you&apos;ve verified in Resend. Falls back
                to your business email.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email-subject">Subject line</Label>
              <Input
                id="email-subject"
                value={form.emailSubject}
                onChange={(e) =>
                  setForm({ ...form, emailSubject: e.target.value })
                }
                placeholder="Invoice {{invoiceNumber}} from {{businessName}}"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="email-greeting">Greeting / intro</Label>
                <Textarea
                  id="email-greeting"
                  value={form.emailGreeting}
                  onChange={(e) =>
                    setForm({ ...form, emailGreeting: e.target.value })
                  }
                  rows={3}
                  placeholder="Hi {{clientName}},&#10;&#10;Please find your invoice below."
                />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="email-signature">Signature / closing</Label>
                <Textarea
                  id="email-signature"
                  value={form.emailSignature}
                  onChange={(e) =>
                    setForm({ ...form, emailSignature: e.target.value })
                  }
                  rows={3}
                  placeholder="Thanks,&#10;{{businessName}}"
                />
              </div>
            </div>
            <div className="grid gap-2 sm:max-w-xs">
              <Label htmlFor="email-color">Accent color</Label>
              <div className="flex items-center gap-2">
                <input
                  id="email-color"
                  type="color"
                  value={form.emailAccentColor}
                  onChange={(e) =>
                    setForm({ ...form, emailAccentColor: e.target.value })
                  }
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                />
                <Input
                  aria-label="Accent color hex value"
                  value={form.emailAccentColor}
                  onChange={(e) =>
                    setForm({ ...form, emailAccentColor: e.target.value })
                  }
                  placeholder="#111827"
                  className="min-w-0 font-mono text-sm"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-3">
            <SaveStatus dirty={emailDirty} saved={emailSaved} />
            <Button
              size="sm"
              onClick={handleEmailFormatSave}
              disabled={emailSaving}
              data-testid="settings-save-email-format"
            >
              {emailSaving ? "Saving..." : "Save email format"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Payout Threshold Dialog */}
      <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payout threshold</DialogTitle>
            <DialogDescription>
              Set the minimum balance required before a payout is triggered.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="payout-currency">Preferred currency</Label>
              <Select
                value={form.payoutCurrency}
                onValueChange={(v) => setForm({ ...form, payoutCurrency: v })}
              >
                <SelectTrigger id="payout-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="payout-amount">Minimum payout amount</Label>
                <div className="flex items-baseline">
                  <span className="text-2xl font-semibold text-muted-foreground tabular-nums">
                    $
                  </span>
                  <Input
                    id="payout-amount"
                    type="number"
                    inputMode="decimal"
                    min={50}
                    max={10000}
                    step={50}
                    value={form.payoutMinAmount}
                    onChange={(e) => {
                      const raw = e.target.value
                      if (raw === "") {
                        setForm({ ...form, payoutMinAmount: 0 })
                        return
                      }
                      const n = parseFloat(raw)
                      if (!Number.isNaN(n)) {
                        setForm({ ...form, payoutMinAmount: n })
                      }
                    }}
                    onBlur={(e) => {
                      const n = parseFloat(e.target.value)
                      const clamped = Number.isNaN(n)
                        ? 50
                        : Math.min(10000, Math.max(50, n))
                      setForm({ ...form, payoutMinAmount: clamped })
                    }}
                    className="h-auto w-32 border-0 bg-transparent p-0 text-right text-2xl font-semibold tabular-nums shadow-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </div>
              </div>
              <Slider
                aria-label="Minimum payout amount"
                value={[
                  Math.min(10000, Math.max(50, form.payoutMinAmount || 50)),
                ]}
                onValueChange={([v]) =>
                  setForm({ ...form, payoutMinAmount: v })
                }
                min={50}
                max={10000}
                step={50}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>$50 minimum</span>
                <span>$10,000 maximum</span>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payout-notes">Notes</Label>
              <Textarea
                id="payout-notes"
                value={form.payoutNotes}
                onChange={(e) =>
                  setForm({ ...form, payoutNotes: e.target.value })
                }
                placeholder="Add any notes for this payout configuration..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handlePayoutSave}>Save threshold</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Preview Dialog — full PDF-size */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto p-0 sm:max-w-4xl">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-6 py-3">
            <DialogTitle>Invoice Email Preview</DialogTitle>
          </div>
          <div className="mx-auto w-full max-w-[8.5in] bg-white px-[0.75in] py-[0.5in] text-black dark:bg-white">
            <div className="border-b-2 border-black pb-4">
              <h1 className="text-2xl font-bold">{senderName}</h1>
              {form.businessEmail && (
                <p className="mt-1 text-sm text-gray-500">
                  {form.businessEmail}
                </p>
              )}
              {form.businessPhone && (
                <p className="text-sm text-gray-500">{form.businessPhone}</p>
              )}
              {form.businessAddress && (
                <p className="mt-1 text-sm whitespace-pre-line text-gray-500">
                  {form.businessAddress}
                </p>
              )}
            </div>

            <div className="mt-8 flex justify-between">
              <div>
                <p className="text-xs font-medium tracking-wider text-gray-400 uppercase">
                  Bill To
                </p>
                <p className="mt-2 text-lg font-semibold">Client Name</p>
                <p className="text-sm text-gray-500">client@example.com</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-3xl font-bold">
                  {form.invoicePrefix}
                  {form.nextInvoiceNumber}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Issued: May 8, 2026
                  <br />
                  Due: Jun 7, 2026
                </p>
              </div>
            </div>

            <table className="mt-8 w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border-b-2 border-gray-200 px-4 py-3 text-left text-xs font-semibold tracking-wider text-gray-500 uppercase">
                    Description
                  </th>
                  <th className="border-b-2 border-gray-200 px-4 py-3 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">
                    Qty
                  </th>
                  <th className="border-b-2 border-gray-200 px-4 py-3 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">
                    Rate
                  </th>
                  <th className="border-b-2 border-gray-200 px-4 py-3 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border-b border-gray-200 px-4 py-3 text-sm">
                    Website Redesign: Homepage layout (May 1)
                  </td>
                  <td className="border-b border-gray-200 px-4 py-3 text-right font-mono text-sm">
                    3.50
                  </td>
                  <td className="border-b border-gray-200 px-4 py-3 text-right font-mono text-sm">
                    $150.00
                  </td>
                  <td className="border-b border-gray-200 px-4 py-3 text-right font-mono text-sm font-medium">
                    $525.00
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-gray-200 px-4 py-3 text-sm">
                    Website Redesign: API integration (May 3)
                  </td>
                  <td className="border-b border-gray-200 px-4 py-3 text-right font-mono text-sm">
                    5.00
                  </td>
                  <td className="border-b border-gray-200 px-4 py-3 text-right font-mono text-sm">
                    $150.00
                  </td>
                  <td className="border-b border-gray-200 px-4 py-3 text-right font-mono text-sm font-medium">
                    $750.00
                  </td>
                </tr>
                <tr>
                  <td className="border-b border-gray-200 px-4 py-3 text-sm">
                    Domain renewal (expense)
                  </td>
                  <td className="border-b border-gray-200 px-4 py-3 text-right font-mono text-sm">
                    1
                  </td>
                  <td className="border-b border-gray-200 px-4 py-3 text-right font-mono text-sm">
                    $14.99
                  </td>
                  <td className="border-b border-gray-200 px-4 py-3 text-right font-mono text-sm font-medium">
                    $14.99
                  </td>
                </tr>
              </tbody>
            </table>

            <div
              className={`mt-6 ml-auto ${sampleSecondary ? "w-full max-w-sm" : "w-72"}`}
            >
              <div className="flex justify-between py-2 text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-mono">{sampleMoney(1289.99)}</span>
              </div>
              <div className="flex justify-between py-2 text-sm">
                <span className="text-gray-500">Tax</span>
                <span className="font-mono">{sampleMoney(0)}</span>
              </div>
              <div className="flex justify-between border-t-2 border-black py-3 text-lg font-bold">
                <span>Total</span>
                <span className="font-mono">{sampleMoney(1289.99)}</span>
              </div>
              {sampleSecondary && (
                <SecondaryTotalRow secondary={sampleSecondary} />
              )}
            </div>

            <PaymentOptions accounts={sampleAccounts} />

            <p className="mt-10 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
              Generated by {senderName}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
