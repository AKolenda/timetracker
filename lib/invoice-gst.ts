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

export const GST_ZERO_RATED_NOTE =
  "Zero-rated supply of services to a non-resident of Canada (Excise Tax Act, Sch. VI, Part V)."

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

/**
 * What an invoice prints. A draft follows today's settings and client; an issued invoice
 * keeps what it was issued with, so invoices from before GST registration stay unchanged.
 */
export function invoiceGst(
  invoice: Pick<Invoice, "status" | "gstNumber" | "gstZeroRated">,
  settingsNumber: unknown,
  clientZeroRated: boolean | null | undefined
): InvoiceGst | null {
  const lock =
    invoice.status === "draft"
      ? liveGst(settingsNumber, clientZeroRated)
      : { gstNumber: normalizeGstNumber(invoice.gstNumber) || null, gstZeroRated: !!invoice.gstZeroRated }
  return lock.gstNumber ? { number: lock.gstNumber, zeroRated: lock.gstZeroRated } : null
}

/** The totals row label and the reason printed under the totals. */
export function gstTaxLine(
  gst: InvoiceGst | null,
  tax: number
): { label: string; note: string | null } {
  if (!gst) return { label: "Tax", note: null }
  if (gst.zeroRated && Number(tax) === 0) {
    return { label: "GST (Canada) 0% · zero-rated", note: GST_ZERO_RATED_NOTE }
  }
  return { label: "GST (Canada)", note: null }
}

export function gstNumberLine(gst: InvoiceGst | null): string | null {
  return gst ? `GST/HST No. ${gst.number}` : null
}
