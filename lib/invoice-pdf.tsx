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
import {
  INVOICE_CURRENCY,
  formatWithCode,
  paymentAccounts,
  rateNote,
  type SecondaryTotal,
} from "./invoice-currency"
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
  // Large text sets its own line height; the page's 1.4 resolves against 9pt and overlaps it.
  businessName: { fontSize: 18, lineHeight: 1.2, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  headerRight: { alignItems: "flex-end" },
  businessMeta: { marginTop: 2, fontSize: 9, color: COLORS.gray500 },
  invoiceNumberBig: {
    fontSize: 24,
    lineHeight: 1.2,
    fontFamily: "Courier-Bold",
    textAlign: "right",
  },
  headerTotalLabel: {
    marginTop: 8,
    fontSize: 8,
    color: COLORS.gray400,
    textTransform: "uppercase",
    letterSpacing: 1,
    textAlign: "right",
  },
  headerTotalValue: {
    marginTop: 2,
    fontSize: 16,
    lineHeight: 1.2,
    fontFamily: "Courier-Bold",
    textAlign: "right",
  },
  headerSecondary: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 1.2,
    fontFamily: "Courier",
    color: COLORS.gray500,
    textAlign: "right",
  },
  headerDueBadge: {
    marginTop: 2,
    fontSize: 9,
    color: COLORS.gray500,
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
    lineHeight: 1.2,
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
  grandTotalLabel: { fontSize: 14, lineHeight: 1.2, fontFamily: "Helvetica-Bold" },
  grandTotalValue: {
    fontSize: 14,
    lineHeight: 1.2,
    fontFamily: "Courier-Bold",
  },
  secondaryTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  secondaryTotalValue: { fontSize: 10, fontFamily: "Courier-Bold" },
  rateNote: {
    marginTop: 2,
    fontSize: 7,
    color: COLORS.gray400,
    textAlign: "right",
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
  remittanceAccounts: { flexDirection: "row", gap: 16 },
  remittanceAccount: { flex: 1 },
  remittanceHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
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
  secondary = null,
}: {
  invoice: Invoice
  client: Client | undefined
  settings: Settings
  secondary?: SecondaryTotal | null
}) {
  const businessName = settings.businessName || "Your Name"
  const money = (amount: number) =>
    secondary ? formatWithCode(amount, INVOICE_CURRENCY) : formatCurrency(amount)
  const accounts = paymentAccounts(
    {
      firstName: settings.remittanceFirstName,
      lastName: settings.remittanceLastName,
      bankName: settings.remittanceBankName,
      routingNumber: settings.remittanceRoutingNumber,
      accountNumber: settings.remittanceAccountNumber,
      notes: settings.remittanceNotes,
    },
    invoice.total,
    secondary
  )
  const dueOnReceipt = invoice.dueDate === invoice.issueDate

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
          <View style={styles.headerRight}>
            <Text style={styles.invoiceNumberBig}>
              {invoice.invoiceNumber}
            </Text>
            <Text style={styles.headerTotalLabel}>Total Due</Text>
            <Text style={styles.headerTotalValue}>
              {money(invoice.total)}
            </Text>
            {secondary ? (
              <Text style={styles.headerSecondary}>
                or {formatWithCode(secondary.amount, secondary.currency)}
              </Text>
            ) : null}
            <Text style={styles.headerDueBadge}>
              {dueOnReceipt
                ? "Due on receipt"
                : `Due ${fmtDate(invoice.dueDate)}`}
            </Text>
          </View>
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
            {dueOnReceipt ? (
              <Text style={styles.dateLine}>
                <Text style={styles.dateLabel}>Due on receipt</Text>
              </Text>
            ) : (
              <Text style={styles.dateLine}>
                <Text style={styles.dateLabel}>Due: </Text>
                {fmtDate(invoice.dueDate)}
              </Text>
            )}
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
              {money(invoice.subtotal)}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text style={styles.totalsValue}>
              {money(invoice.tax)}
            </Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>
              {money(invoice.total)}
            </Text>
          </View>
          {secondary ? (
            <>
              <View style={styles.secondaryTotalRow}>
                <Text style={styles.totalsLabel}>
                  Total in {secondary.currency}
                </Text>
                <Text style={styles.secondaryTotalValue}>
                  {formatWithCode(secondary.amount, secondary.currency)}
                </Text>
              </View>
              <Text style={styles.rateNote}>{rateNote(secondary)}</Text>
            </>
          ) : null}
        </View>

        {/* Notes */}
        {invoice.notes ? (
          <View style={styles.notes}>
            <Text style={styles.notesLabel}>Notes</Text>
            <Text style={styles.notesBody}>{invoice.notes}</Text>
          </View>
        ) : null}

        {/* Remittance */}
        {accounts.length ? (
          <View style={styles.remittance} wrap={false}>
            <Text style={styles.remittanceLabel}>
              {accounts.length > 1 ? "Payment Options" : "Remittance Information"}
            </Text>
            <View style={styles.remittanceAccounts}>
              {accounts.map((account) => (
                <View style={styles.remittanceAccount} key={account.heading}>
                  {account.heading ? (
                    <View style={styles.remittanceHeading}>
                      <Text>{account.heading}</Text>
                      <Text style={styles.mono}>{account.amount}</Text>
                    </View>
                  ) : null}
                  {account.lines.map((line) => (
                    <Text style={styles.remittanceLine} key={line.label}>
                      <Text style={styles.remittanceMuted}>{line.label}: </Text>
                      {line.mono ? (
                        <Text style={styles.mono}>{line.value}</Text>
                      ) : (
                        line.value
                      )}
                    </Text>
                  ))}
                  {account.notes ? (
                    <Text style={styles.remittanceNotes}>{account.notes}</Text>
                  ) : null}
                </View>
              ))}
            </View>
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
  settings: Settings,
  secondary: SecondaryTotal | null = null
): Promise<void> {
  const blob = await pdf(
    <InvoicePdfDocument
      invoice={invoice}
      client={client}
      settings={settings}
      secondary={secondary}
    />
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
