import type { Invoice } from "./types.ts"

/** The GST details printed on one invoice. */
export interface InvoiceGst {
  /** GST/HST registration number, e.g. "738078377 RT0001". */
  number: string
  /** The client is a non-resident, so the supply is zero-rated. */
  zeroRated: boolean
}

/** The GST columns saved on an invoice when it is issued. */
export interface GstLock {
  gstNumber: string | null
  gstZeroRated: boolean
}

export function normalizeGstNumber(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
}

/** The GST details a draft would print today, from the business's number and the client. */
export function liveGst(
  settingsNumber: unknown,
  clientZeroRated: boolean | null | undefined
): GstLock {
  const number = normalizeGstNumber(settingsNumber)
  return { gstNumber: number || null, gstZeroRated: !!number && !!clientZeroRated }
}

function savedGst(invoice: Pick<Invoice, "gstNumber" | "gstZeroRated">): GstLock | null {
  const number = normalizeGstNumber(invoice.gstNumber)
  return number ? { gstNumber: number, gstZeroRated: !!invoice.gstZeroRated } : null
}

/** The details to save when a draft is issued, or null when it already has them. */
export function gstLockToIssue(
  invoice: Pick<Invoice, "gstNumber" | "gstZeroRated">,
  settingsNumber: unknown,
  clientZeroRated: boolean | null | undefined
): GstLock | null {
  return savedGst(invoice) ? null : liveGst(settingsNumber, clientZeroRated)
}

/**
 * What an invoice prints. Saved details never change; an unsaved draft follows today's
 * settings and client; an issued invoice with none, from before registration, shows none.
 */
export function invoiceGst(
  invoice: Pick<Invoice, "status" | "gstNumber" | "gstZeroRated">,
  settingsNumber: unknown,
  clientZeroRated: boolean | null | undefined
): InvoiceGst | null {
  const lock =
    savedGst(invoice) ??
    (invoice.status === "draft" ? liveGst(settingsNumber, clientZeroRated) : null)
  return lock?.gstNumber ? { number: lock.gstNumber, zeroRated: lock.gstZeroRated } : null
}

/** The label for the totals row that holds the tax amount. */
export function gstTaxLabel(gst: InvoiceGst | null, tax: number): string {
  // A manual tax amount isn't recorded as GST, so it keeps the plain label.
  if (!gst || Number(tax) !== 0) return "Tax"
  return gst.zeroRated ? "GST (Canada) 0% · zero-rated" : "GST (Canada) 0%"
}

export function gstNumberLine(gst: InvoiceGst | null): string | null {
  return gst ? `GST/HST No. ${gst.number}` : null
}
