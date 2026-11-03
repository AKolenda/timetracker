import type { Invoice, SecondaryRemittance } from "./types.ts"

/** Invoices are charged in this currency; a secondary currency is shown alongside it. */
export const INVOICE_CURRENCY = "USD"

export interface ExchangeQuote {
  rate: number
  /** Date the reference rate was published, as YYYY-MM-DD. */
  date: string
}

export interface FxLock {
  fxCurrency: string
  fxRate: number
  fxRateDate: string
}

export interface SecondaryTotal {
  currency: string
  rate: number
  date: string
  amount: number
  /** False while the invoice is a draft and the rate is still today's. */
  locked: boolean
  account: SecondaryRemittance | null
}

const CURRENCY_CODE = /^[A-Z]{3}$/

export function isCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && CURRENCY_CODE.test(value)
}

export function parseSecondaryRemittance(value: unknown): SecondaryRemittance {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const text = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : "")
  const currency = text("currency").toUpperCase()
  return {
    currency: isCurrencyCode(currency) && currency !== INVOICE_CURRENCY ? currency : "",
    accountName: text("accountName"),
    bankName: text("bankName"),
    routingNumber: text("routingNumber"),
    accountNumber: text("accountNumber"),
    notes: text("notes"),
  }
}

/** The currency a client's new invoices should also show, or null when they show USD only. */
export function secondaryCurrencyFor(
  showSecondaryCurrency: boolean | null | undefined,
  account: SecondaryRemittance | null | undefined
): string | null {
  if (!showSecondaryCurrency || !account?.currency) return null
  return account.currency === INVOICE_CURRENCY ? null : account.currency
}

function lockedQuote(invoice: Pick<Invoice, "fxCurrency" | "fxRate" | "fxRateDate">) {
  const rate = Number(invoice.fxRate)
  if (!isCurrencyCode(invoice.fxCurrency) || !(rate > 0)) return null
  return { currency: invoice.fxCurrency, rate, date: invoice.fxRateDate ?? "" }
}

/** True when issuing this invoice should record today's rate. */
export function needsFxLock(
  invoice: Pick<Invoice, "fxCurrency" | "fxRate" | "fxRateDate">,
  currency: string | null
): currency is string {
  return !!currency && !lockedQuote(invoice)
}

export function toFxLock(currency: string, quote: ExchangeQuote): FxLock {
  return { fxCurrency: currency, fxRate: quote.rate, fxRateDate: quote.date }
}

export function convertAmount(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100
}

/**
 * The converted total to print on an invoice. An issued invoice keeps the rate it was
 * sent with; a draft uses today's quote for the client's secondary currency.
 */
export function secondaryTotal(
  invoice: Pick<Invoice, "total" | "fxCurrency" | "fxRate" | "fxRateDate">,
  currency: string | null,
  account: SecondaryRemittance | null | undefined,
  liveQuote: ExchangeQuote | null
): SecondaryTotal | null {
  const locked = lockedQuote(invoice)
  const quote = locked ?? (currency && liveQuote && liveQuote.rate > 0 ? { currency, ...liveQuote } : null)
  if (!quote) return null
  return {
    currency: quote.currency,
    rate: quote.rate,
    date: quote.date,
    amount: convertAmount(invoice.total, quote.rate),
    locked: !!locked,
    account: account?.currency === quote.currency ? account : null,
  }
}

export function hasAccountDetails(account: SecondaryRemittance | null | undefined): boolean {
  return !!account && !!(account.accountName || account.bankName || account.accountNumber)
}

/** "1 USD = 1.4269 AUD" */
export function formatRate(currency: string, rate: number): string {
  return `1 ${INVOICE_CURRENCY} = ${rate.toFixed(4)} ${currency}`
}

const codeFormatters = new Map<string, Intl.NumberFormat>()

/** "USD 1,500.00" — the currency code keeps two dollar currencies apart on one invoice. */
export function formatWithCode(amount: number, currency: string): string {
  let formatter = codeFormatters.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
    })
    codeFormatters.set(currency, formatter)
  }
  return formatter.format(amount).replace(/ /g, " ")
}

/** "Nov 2, 2026" from YYYY-MM-DD, without shifting the day across timezones. */
export function formatRateDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return date
  const [, y, m, d] = match.map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** One line explaining the conversion, for every place an invoice is rendered. */
export function rateNote(secondary: SecondaryTotal): string {
  const date = secondary.date ? `, ${formatRateDate(secondary.date)}` : ""
  return `${formatRate(secondary.currency, secondary.rate)} (ECB reference rate${date})`
}

export interface PrimaryRemittance {
  firstName?: string | null
  lastName?: string | null
  bankName?: string | null
  routingNumber?: string | null
  accountNumber?: string | null
  notes?: string | null
}

export interface AccountLine {
  label: string
  value: string
  mono?: boolean
}

export interface PaymentAccount {
  /** Empty for a USD-only invoice, which keeps its single untitled block. */
  heading: string
  amount: string
  lines: AccountLine[]
  notes: string
}

/** What each country calls the bank code that sits beside the account number. */
export function routingLabel(currency: string): string {
  if (currency === "AUD") return "BSB"
  if (currency === "GBP") return "Sort code"
  if (currency === "EUR") return "BIC / SWIFT"
  if (currency === "CAD") return "Transit / institution"
  return "Routing"
}

/** The accounts a client can pay into, in the order they appear on the invoice. */
export function paymentAccounts(
  primary: PrimaryRemittance,
  total: number,
  secondary: SecondaryTotal | null
): PaymentAccount[] {
  const accounts: PaymentAccount[] = []
  const dual = !!secondary && hasAccountDetails(secondary.account)
  if (primary.firstName || primary.bankName) {
    const name = `${primary.firstName ?? ""} ${primary.lastName ?? ""}`.trim()
    const lines: AccountLine[] = []
    if (name) lines.push({ label: "Pay to", value: name })
    if (primary.bankName) lines.push({ label: "Bank", value: primary.bankName })
    if (primary.routingNumber) lines.push({ label: "Routing", value: primary.routingNumber, mono: true })
    if (primary.accountNumber) lines.push({ label: "Account", value: primary.accountNumber, mono: true })
    accounts.push({
      heading: dual ? `Pay in ${INVOICE_CURRENCY}` : "",
      amount: dual ? formatWithCode(total, INVOICE_CURRENCY) : "",
      lines,
      notes: primary.notes ?? "",
    })
  }
  if (dual && secondary.account) {
    const account = secondary.account
    const lines: AccountLine[] = []
    if (account.accountName) lines.push({ label: "Pay to", value: account.accountName })
    if (account.bankName) lines.push({ label: "Bank", value: account.bankName })
    if (account.routingNumber) lines.push({ label: routingLabel(secondary.currency), value: account.routingNumber, mono: true })
    if (account.accountNumber) lines.push({ label: "Account", value: account.accountNumber, mono: true })
    accounts.push({
      heading: accounts.length ? `Or pay in ${secondary.currency}` : `Pay in ${secondary.currency}`,
      amount: formatWithCode(secondary.amount, secondary.currency),
      lines,
      notes: account.notes,
    })
  }
  return accounts
}
