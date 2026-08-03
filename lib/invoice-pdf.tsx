"use client"

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer"
import { format } from "date-fns"

import { formatCurrency } from "./format"
import type { Client, Invoice, Settings } from "./types"

// Tailwind gray palette → hex, matching the on-screen InvoicePreview
const COLORS = {
  black: "#000000",
  gray700: "#374151",
  gray500: "#6b7280",
  gray400: "#9ca3af",
  gray300: "#d1d5db",
  gray200: "#e5e7eb",
  gray50: "#f9fafb",
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 54, // 0.75in
    paddingVertical: 36, // 0.5in
    fontFamily: "Helvetica",
    fontSize: 9,
    color: COLORS.black,
    lineHeight: 1.4,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: COLORS.black,
    paddingBottom: 12,
  },
  businessName: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  businessMeta: { marginTop: 2, fontSize: 9, color: COLORS.gray500 },
  invoiceNumberBig: {
    fontSize: 24,
    fontFamily: "Courier-Bold",
    textAlign: "right",
  },

  // Bill-to / dates
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  sectionLabel: {
    fontSize: 8,
    color: COLORS.gray400,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  clientName: {
    marginTop: 6,
    marginBottom: 3,
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  clientMeta: { fontSize: 9, color: COLORS.gray500 },
  dateBlock: { textAlign: "right" },
  dateLine: { fontSize: 9, color: COLORS.gray500, marginTop: 2 },
  dateLabel: { color: COLORS.gray700, fontFamily: "Helvetica-Bold" },

  // Line-items table
  table: { marginTop: 14 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.gray50,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.gray200,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  th: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: COLORS.gray500,
  },
  td: { paddingVertical: 5, paddingHorizontal: 8, fontSize: 9 },
  colDesc: { flex: 1 },
  colNum: { width: 70, textAlign: "right" },
  mono: { fontFamily: "Courier" },
  bold: { fontFamily: "Helvetica-Bold" },

  // Totals
  totals: { marginTop: 14, marginLeft: "auto", width: 220 },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalsLabel: { fontSize: 10, color: COLORS.gray500 },
  totalsValue: { fontSize: 10, fontFamily: "Courier" },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 2,
    borderTopColor: COLORS.black,
    paddingTop: 8,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  grandTotalValue: {
    fontSize: 14,
    fontFamily: "Courier-Bold",
  },

  // Notes
  notes: {
    marginTop: 14,
    backgroundColor: COLORS.gray50,
    borderRadius: 4,
    padding: 12,
  },
  notesLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLORS.gray500,
  },
  notesBody: { marginTop: 4, fontSize: 9, color: COLORS.gray700 },

  // Remittance
  remittance: {
    marginTop: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: COLORS.gray300,
    borderRadius: 6,
    padding: 16,
  },
  remittanceLabel: {
    marginBottom: 8,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLORS.gray500,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  remittanceLine: { fontSize: 9, marginTop: 2 },
  remittanceMuted: { color: COLORS.gray500 },
  remittanceNotes: { marginTop: 8, fontSize: 8, color: COLORS.gray500 },

  // Footer
  footer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    paddingTop: 12,
    textAlign: "center",
    fontSize: 8,
    color: COLORS.gray400,
  },
})

function fmtDate(value: string): string {
  // Mirror the preview's "MMM d, yyyy" formatting; tolerate bad input.
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : format(d, "MMM d, yyyy")
}

export function InvoicePdfDocument({
  invoice,
  client,
  settings,
}: {
  invoice: Invoice
  client: Client | undefined
  settings: Settings
}) {
  const businessName = settings.businessName || "Your Name"
  const hasRemittance =
    !!settings.remittanceFirstName || !!settings.remittanceBankName
  const remitName = `${settings.remittanceFirstName ?? ""} ${
    settings.remittanceLastName ?? ""
  }`.trim()

  return (
    <Document
      title={invoice.invoiceNumber}
      author={businessName}
      subject={`Invoice ${invoice.invoiceNumber}`}
    >
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.businessName}>{businessName}</Text>
            {settings.businessEmail ? (
              <Text style={styles.businessMeta}>{settings.businessEmail}</Text>
            ) : null}
            {settings.businessPhone ? (
              <Text style={styles.businessMeta}>{settings.businessPhone}</Text>
            ) : null}
            {settings.businessAddress ? (
              <Text style={styles.businessMeta}>
                {settings.businessAddress}
              </Text>
            ) : null}
          </View>
          <Text style={styles.invoiceNumberBig}>{invoice.invoiceNumber}</Text>
        </View>

        {/* Bill To + dates */}
        <View style={styles.metaRow}>
          <View>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={styles.clientName}>{client?.name ?? "—"}</Text>
            {client?.email ? (
              <Text style={styles.clientMeta}>{client.email}</Text>
            ) : null}
            {client?.address ? (
              <Text style={styles.clientMeta}>{client.address}</Text>
            ) : null}
          </View>
          <View style={styles.dateBlock}>
            <Text style={styles.dateLine}>
              <Text style={styles.dateLabel}>Issued: </Text>
              {fmtDate(invoice.issueDate)}
            </Text>
            <Text style={styles.dateLine}>
              <Text style={styles.dateLabel}>Due: </Text>
              {invoice.dueDate === invoice.issueDate
                ? "Due on receipt"
                : fmtDate(invoice.dueDate)}
            </Text>
          </View>
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colNum]}>Qty</Text>
            <Text style={[styles.th, styles.colNum]}>Rate</Text>
            <Text style={[styles.th, styles.colNum]}>Amount</Text>
          </View>
          {invoice.lineItems.map((item) => (
            <View style={styles.tableRow} key={item.id} wrap={false}>
              <Text style={[styles.td, styles.colDesc]}>
                {item.description}
              </Text>
              <Text style={[styles.td, styles.colNum, styles.mono]}>
                {item.quantity}
              </Text>
              <Text style={[styles.td, styles.colNum, styles.mono]}>
                {formatCurrency(item.unitPrice)}
              </Text>
              <Text
                style={[styles.td, styles.colNum, styles.mono, styles.bold]}
              >
                {formatCurrency(item.amount)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>
              {formatCurrency(invoice.subtotal)}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text style={styles.totalsValue}>
              {formatCurrency(invoice.tax)}
            </Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>
              {formatCurrency(invoice.total)}
            </Text>
          </View>
        </View>

        {/* Notes */}
        {invoice.notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesBody}>{invoice.notes}</Text>
          </View>
        ) : null}

        {/* Remittance */}
        {hasRemittance ? (
          <View style={styles.remittance}>
            <Text style={styles.remittanceLabel}>Remittance Information</Text>
            {remitName ? (
              <Text style={styles.remittanceLine}>
                <Text style={styles.remittanceMuted}>Pay to: </Text>
                {remitName}
              </Text>
            ) : null}
            {settings.remittanceBankName ? (
              <Text style={styles.remittanceLine}>
                <Text style={styles.remittanceMuted}>Bank: </Text>
                {settings.remittanceBankName}
              </Text>
            ) : null}
            {settings.remittanceRoutingNumber ? (
              <Text style={styles.remittanceLine}>
                <Text style={styles.remittanceMuted}>Routing: </Text>
                <Text style={styles.mono}>
                  {settings.remittanceRoutingNumber}
                </Text>
              </Text>
            ) : null}
            {settings.remittanceAccountNumber ? (
              <Text style={styles.remittanceLine}>
                <Text style={styles.remittanceMuted}>Account: </Text>
                <Text style={styles.mono}>
                  {settings.remittanceAccountNumber}
                </Text>
              </Text>
            ) : null}
            {settings.remittanceNotes ? (
              <Text style={styles.remittanceNotes}>
                {settings.remittanceNotes}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Footer */}
        <Text style={styles.footer}>Generated by {businessName}</Text>
      </Page>
    </Document>
  )
}

/**
 * Generate the invoice PDF and trigger a browser download.
 * Lazily pulls in @react-pdf/renderer (this module is itself dynamically
 * imported from the invoices page), so the renderer stays out of the
 * initial page bundle.
 */
export async function downloadInvoicePdf(
  invoice: Invoice,
  client: Client | undefined,
  settings: Settings
): Promise<void> {
  const blob = await pdf(
    <InvoicePdfDocument invoice={invoice} client={client} settings={settings} />
  ).toBlob()

  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement("a")
    link.href = url
    link.download = `${invoice.invoiceNumber}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}
