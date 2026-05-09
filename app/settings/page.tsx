"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Eye, DollarSign, Key, CheckCircle2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
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
import { useStore } from "@/lib/store"
import { formatCurrency } from "@/lib/format"
import {
  getBrowserTimezone,
  listTimezones,
} from "@/lib/datetime"

const CURRENCIES = [
  { value: "USD", label: "USD — United States Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "CAD", label: "CAD — Canadian Dollar" },
  { value: "AUD", label: "AUD — Australian Dollar" },
]

export default function SettingsPage() {
  const { data, updateSettings } = useStore()
  const [form, setForm] = useState({ ...data.settings })
  const [saving, setSaving] = useState(false)
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
      .then((d) => setResendStatus({ configured: !!d.configured, masked: d.masked ?? null }))
      .catch(() => {})
  }, [])

  async function handleSendTest() {
    if (!testEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail.trim())) {
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
          from: form.emailFromAddress || form.businessEmail || "invoices@resend.dev",
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
    try {
      await updateSettings({
        emailSubject: form.emailSubject,
        emailGreeting: form.emailGreeting,
        emailSignature: form.emailSignature,
        emailAccentColor: form.emailAccentColor,
        emailFromAddress: form.emailFromAddress,
      })
      toast.success("Email format saved")
    } catch {
      toast.error("Failed to save email format")
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateSettings({
        businessName: form.businessName,
        businessEmail: form.businessEmail,
        businessPhone: form.businessPhone,
        businessAddress: form.businessAddress,
        remittanceFirstName: form.remittanceFirstName,
        remittanceLastName: form.remittanceLastName,
        remittanceBankName: form.remittanceBankName,
        remittanceRoutingNumber: form.remittanceRoutingNumber,
        remittanceAccountNumber: form.remittanceAccountNumber,
        remittanceNotes: form.remittanceNotes,
        invoicePrefix: form.invoicePrefix,
        nextInvoiceNumber: form.nextInvoiceNumber,
        timezone: form.timezone,
        defaultInvoiceDueDays: form.defaultInvoiceDueDays,
      })
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
      setResendStatus({ configured: !!status.configured, masked: status.masked ?? null })
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

  return (
    <>
      <PageHeader
        title="Settings"
        description="Configure your profile and invoice settings"
        actions={
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Your Information
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="biz-name">Name / Business Name</Label>
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
            <div className="grid gap-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={form.timezone || getBrowserTimezone()}
                onValueChange={(v) => setForm({ ...form, timezone: v })}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {listTimezones().map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used to date your time entries correctly. Detected browser timezone:{" "}
                <code className="font-mono">{getBrowserTimezone()}</code>.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Invoice Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="inv-prefix">Invoice Prefix</Label>
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
                  <Label htmlFor="inv-next">Next Invoice #</Label>
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
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="net-due">Net Due</Label>
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
                    <SelectTrigger id="net-due" className="flex-1">
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
                    value={form.defaultInvoiceDueDays}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        defaultInvoiceDueDays:
                          parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-20 font-mono"
                  />
                  <span className="self-center text-xs text-muted-foreground">
                    days
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Default due-date offset when creating a new invoice. <code className="font-mono">0</code> = due on receipt.
                </p>
              </div>
              <Separator />
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye className="size-4" data-icon="inline-start" />
                  Preview Email
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPayoutOpen(true)}
                >
                  <DollarSign className="size-4" data-icon="inline-start" />
                  Payout Threshold
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-medium">
                    Email Integration
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Connect Resend to send invoices directly to your clients
                  </p>
                </div>
                {resendStatus.configured ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    Not connected
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              {resendStatus.configured ? (
                <div className="grid gap-3">
                  <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Key className="size-4 text-muted-foreground" />
                      <span className="font-mono text-sm">
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
                    <Label htmlFor="resend-key" className="text-xs text-muted-foreground">
                      Replace key
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="resend-key"
                        type="password"
                        value={resendKey}
                        onChange={(e) => setResendKey(e.target.value)}
                        placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
                        className="flex-1 font-mono text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={handleResendSave}
                        disabled={resendSaving || !resendKey.trim()}
                      >
                        {resendSaving ? "Saving..." : "Update"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="resend-key">Resend API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      id="resend-key"
                      type="password"
                      value={resendKey}
                      onChange={(e) => setResendKey(e.target.value)}
                      placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
                      className="flex-1 font-mono text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={handleResendSave}
                      disabled={resendSaving || !resendKey.trim()}
                    >
                      <Key className="size-4" data-icon="inline-start" />
                      {resendSaving ? "Saving..." : "Save Key"}
                    </Button>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Your API key is stored server-side as an environment variable and never exposed to the browser.
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
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSendTest}
                        disabled={testSending || !testEmail.trim()}
                      >
                        {testSending ? "Sending..." : "Send Test"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sends a sample invoice using your saved Email Format settings.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-medium">
                    Email Format
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Customize the subject, greeting, and signature.
                    Variables: <code className="font-mono">{"{{invoiceNumber}}"}</code>{" "}
                    <code className="font-mono">{"{{businessName}}"}</code>{" "}
                    <code className="font-mono">{"{{clientName}}"}</code>{" "}
                    <code className="font-mono">{"{{total}}"}</code>{" "}
                    <code className="font-mono">{"{{dueDate}}"}</code>
                  </p>
                </div>
                <Button size="sm" onClick={handleEmailFormatSave}>
                  Save Format
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email-from">From Address</Label>
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
                  Must be on a domain you&apos;ve verified in Resend. Falls back to your business email.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email-subject">Subject Line</Label>
                <Input
                  id="email-subject"
                  value={form.emailSubject}
                  onChange={(e) =>
                    setForm({ ...form, emailSubject: e.target.value })
                  }
                  placeholder="Invoice {{invoiceNumber}} from {{businessName}}"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email-greeting">Greeting / Intro</Label>
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
              <div className="grid gap-2">
                <Label htmlFor="email-signature">Signature / Closing</Label>
                <Textarea
                  id="email-signature"
                  value={form.emailSignature}
                  onChange={(e) =>
                    setForm({ ...form, emailSignature: e.target.value })
                  }
                  rows={2}
                  placeholder="Thanks,&#10;{{businessName}}"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email-color">Accent Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="email-color"
                    type="color"
                    value={form.emailAccentColor}
                    onChange={(e) =>
                      setForm({ ...form, emailAccentColor: e.target.value })
                    }
                    className="h-9 w-12 cursor-pointer rounded border border-input bg-background p-0.5"
                  />
                  <Input
                    value={form.emailAccentColor}
                    onChange={(e) =>
                      setForm({ ...form, emailAccentColor: e.target.value })
                    }
                    placeholder="#111827"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Remittance Information
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              This information appears on your invoices so clients know how to pay you
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="rem-first">First Name</Label>
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
                <Label htmlFor="rem-last">Last Name</Label>
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
            <Separator />
            <div className="grid gap-2">
              <Label htmlFor="rem-bank">Bank Name</Label>
              <Input
                id="rem-bank"
                value={form.remittanceBankName}
                onChange={(e) =>
                  setForm({ ...form, remittanceBankName: e.target.value })
                }
                placeholder="Chase Bank"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="rem-routing">Routing Number</Label>
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
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="rem-account">Account Number</Label>
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
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rem-notes">Additional Notes</Label>
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
          </CardContent>
        </Card>
      </div>

      {/* Payout Threshold Dialog */}
      <Dialog open={payoutOpen} onOpenChange={setPayoutOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payout Threshold</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Set the minimum balance required before a payout is triggered.
            </p>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <Label>Preferred Currency</Label>
              <Select
                value={form.payoutCurrency}
                onValueChange={(v) => setForm({ ...form, payoutCurrency: v })}
              >
                <SelectTrigger>
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
                <Label htmlFor="payout-amount">Minimum Payout Amount</Label>
                <div className="flex items-baseline">
                  <span className="font-mono text-2xl font-bold text-muted-foreground">$</span>
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
                    className="h-auto w-32 border-0 bg-transparent p-0 text-right font-mono text-2xl font-bold shadow-none focus-visible:ring-0"
                  />
                </div>
              </div>
              <Slider
                value={[Math.min(10000, Math.max(50, form.payoutMinAmount || 50))]}
                onValueChange={([v]) => setForm({ ...form, payoutMinAmount: v })}
                min={50}
                max={10000}
                step={50}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>$50 (MIN)</span>
                <span>$10,000 (MAX)</span>
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
            <Button onClick={handlePayoutSave}>Save Threshold</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Preview Dialog — full PDF-size */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto p-0">
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
                <p className="mt-1 whitespace-pre-line text-sm text-gray-500">
                  {form.businessAddress}
                </p>
              )}
            </div>

            <div className="mt-8 flex justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  Bill To
                </p>
                <p className="mt-2 text-lg font-semibold">Client Name</p>
                <p className="text-sm text-gray-500">client@example.com</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-3xl font-bold">
                  {form.invoicePrefix}{form.nextInvoiceNumber}
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
                  <th className="border-b-2 border-gray-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Description
                  </th>
                  <th className="border-b-2 border-gray-200 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Qty
                  </th>
                  <th className="border-b-2 border-gray-200 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Rate
                  </th>
                  <th className="border-b-2 border-gray-200 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
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

            <div className="ml-auto mt-6 w-72">
              <div className="flex justify-between py-2 text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-mono">$1,289.99</span>
              </div>
              <div className="flex justify-between py-2 text-sm">
                <span className="text-gray-500">Tax</span>
                <span className="font-mono">$0.00</span>
              </div>
              <div className="flex justify-between border-t-2 border-black py-3 text-lg font-bold">
                <span>Total</span>
                <span className="font-mono">$1,289.99</span>
              </div>
            </div>

            {(form.remittanceFirstName || form.remittanceBankName) && (
              <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-5">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Remittance Information
                </p>
                {(form.remittanceFirstName || form.remittanceLastName) && (
                  <p className="text-sm">
                    <span className="text-gray-500">Pay to: </span>
                    {form.remittanceFirstName} {form.remittanceLastName}
                  </p>
                )}
                {form.remittanceBankName && (
                  <p className="text-sm">
                    <span className="text-gray-500">Bank: </span>
                    {form.remittanceBankName}
                  </p>
                )}
                {form.remittanceRoutingNumber && (
                  <p className="text-sm">
                    <span className="text-gray-500">Routing: </span>
                    <span className="font-mono">
                      {form.remittanceRoutingNumber}
                    </span>
                  </p>
                )}
                {form.remittanceAccountNumber && (
                  <p className="text-sm">
                    <span className="text-gray-500">Account: </span>
                    <span className="font-mono">
                      {form.remittanceAccountNumber}
                    </span>
                  </p>
                )}
                {form.remittanceNotes && (
                  <p className="mt-2 whitespace-pre-line text-xs text-gray-500">
                    {form.remittanceNotes}
                  </p>
                )}
              </div>
            )}

            <p className="mt-10 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
              Generated by {senderName}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
