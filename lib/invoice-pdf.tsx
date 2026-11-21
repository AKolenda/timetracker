"use client"

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer"

import type { SecondaryTotal } from "./invoice-currency"
import { buildInvoiceDocument } from "./invoice-document"
import { invoiceGst } from "./invoice-gst"
import type { Client, Invoice, Settings } from "./types"

// Tailwind gray palette → hex, matching the on-screen InvoiceDocumentView
const COLORS = {
  black: "#000000",
  white: "#ffffff",
  gray700: "#374151",
  gray500: "#6b7280",
  gray400: "#9ca3af",
  gray300: "#d1d5db",
  gray200: "#e5e7eb",
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 54, // 0.75in
    paddingVertical: 36, // 0.5in
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: COLORS.black,
    lineHeight: 1.4,
  },
  // Large text sets its own line height; the page's 1.4 resolves against 9.5pt and overlaps it.
  header: { alignItems: "center", marginBottom: 10 },
  businessName: { fontSize: 15, lineHeight: 1.2, fontFamily: "Helvetica-Bold" },
  businessMeta: { marginTop: 2, fontSize: 8.5, color: COLORS.gray500, textAlign: "center" },

  box: {
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 7,
  },
  amountBox: {
    marginTop: 7,
    backgroundColor: COLORS.black,
    borderRadius: 6,
    paddingVertical: 16,
    alignItems: "center",
  },
  amount: { fontSize: 24, lineHeight: 1.2, fontFamily: "Courier-Bold", color: COLORS.white },
  amountNote: { marginTop: 3, fontSize: 9.5, color: COLORS.gray300 },

  pair: { flexDirection: "row", gap: 7 },
  half: { flex: 1 },
  strong: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  strongMono: { fontSize: 10, fontFamily: "Courier-Bold" },
  muted: { fontSize: 9, color: COLORS.gray500 },

  item: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 6 },
  itemRule: { borderTopWidth: 1, borderTopColor: COLORS.gray200 },
  itemText: { flex: 1 },
  itemDetail: { marginTop: 1, fontSize: 8, fontFamily: "Courier", color: COLORS.gray500 },
  mono: { fontFamily: "Courier" },

  row: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 2 },
  rowLabel: { fontSize: 9.5, color: COLORS.gray500 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    marginTop: 4,
    paddingTop: 6,
  },
  totalText: { fontSize: 12, lineHeight: 1.2, fontFamily: "Helvetica-Bold" },
  totalValue: { fontSize: 12, lineHeight: 1.2, fontFamily: "Courier-Bold" },
  rateNote: { marginTop: 2, fontSize: 7, color: COLORS.gray400, textAlign: "right" },
  notes: { fontSize: 9, color: COLORS.gray700 },

  accountHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 5,
  },
  accountLine: { flexDirection: "row", marginTop: 2 },
  accountLabel: { width: 92, paddingRight: 8, fontSize: 9, color: COLORS.gray500 },
  accountValue: { flex: 1, fontSize: 9 },
  accountNotes: { marginTop: 5, fontSize: 8, color: COLORS.gray500 },
})

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
  const doc = buildInvoiceDocument({
    ...invoice,
    business: {
      name: businessName,
      email: settings.businessEmail,
      phone: settings.businessPhone,
      address: settings.businessAddress,
    },
    client: { name: client?.name ?? "—", email: client?.email, address: client?.address },
    gst: invoiceGst(invoice, settings.gstNumber, client?.gstZeroRated),
    secondary,
    remittance: {
      firstName: settings.remittanceFirstName,
      lastName: settings.remittanceLastName,
      bankName: settings.remittanceBankName,
      routingNumber: settings.remittanceRoutingNumber,
      accountNumber: settings.remittanceAccountNumber,
      notes: settings.remittanceNotes,
    },
  })

  return (
    <Document
      title={invoice.invoiceNumber}
      author={businessName}
      subject={`Invoice ${invoice.invoiceNumber}`}
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.businessName}>{doc.business.name}</Text>
          {doc.business.contact ? (
            <Text style={styles.businessMeta}>{doc.business.contact}</Text>
          ) : null}
          {doc.business.address ? (
            <Text style={styles.businessMeta}>{doc.business.address}</Text>
          ) : null}
        </View>

        <View style={styles.amountBox} wrap={false}>
          <Text style={styles.amount}>{doc.amount}</Text>
          <Text style={styles.amountNote}>{doc.amountNote}</Text>
        </View>

        <View style={styles.pair} wrap={false}>
          <View style={[styles.box, styles.half]}>
            <Text style={styles.strong}>{doc.client.name}</Text>
            {doc.client.lines.map((line) => (
              <Text key={line} style={styles.muted}>{line}</Text>
            ))}
          </View>
          <View style={[styles.box, styles.half]}>
            <Text style={styles.strongMono}>{doc.invoice.number}</Text>
            {doc.invoice.lines.map((line) => (
              <Text key={line} style={styles.muted}>{line}</Text>
            ))}
          </View>
        </View>

        {doc.items.length ? (
          <View style={[styles.box, { paddingVertical: 4 }]}>
            {doc.items.map((item, index) => (
              <View
                key={index}
                style={index ? [styles.item, styles.itemRule] : styles.item}
                wrap={false}
              >
                <View style={styles.itemText}>
                  <Text>{item.description}</Text>
                  {item.detail ? <Text style={styles.itemDetail}>{item.detail}</Text> : null}
                </View>
                <Text style={styles.mono}>{item.amount}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.box} wrap={false}>
          {doc.totals.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.mono}>{row.value}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalText}>{doc.total.label}</Text>
            <Text style={styles.totalValue}>{doc.total.value}</Text>
          </View>
          {doc.converted ? (
            <>
              <View style={[styles.row, { marginTop: 3 }]}>
                <Text style={styles.rowLabel}>{doc.converted.label}</Text>
                <Text style={{ fontFamily: "Courier-Bold" }}>{doc.converted.value}</Text>
              </View>
              <Text style={styles.rateNote}>{doc.converted.note}</Text>
            </>
          ) : null}
        </View>

        {doc.notes ? (
          <View style={styles.box}>
            <Text style={styles.notes}>{doc.notes}</Text>
          </View>
        ) : null}

        {doc.accounts.length ? (
          <View style={styles.pair} wrap={false}>
            {doc.accounts.map((account, index) => (
              <View key={account.heading || index} style={[styles.box, styles.half]}>
                {account.heading ? (
                  <View style={styles.accountHeading}>
                    <Text style={styles.strong}>{account.heading}</Text>
                    <Text style={styles.strongMono}>{account.amount}</Text>
                  </View>
                ) : null}
                {account.lines.map((line) => (
                  <View key={line.label} style={styles.accountLine}>
                    <Text style={styles.accountLabel}>{line.label}</Text>
                    <Text style={line.mono ? [styles.accountValue, styles.mono] : styles.accountValue}>
                      {line.value}
                    </Text>
                  </View>
                ))}
                {account.notes ? (
                  <Text style={styles.accountNotes}>{account.notes}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
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
