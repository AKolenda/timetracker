import { isCurrencyCode, type ExchangeQuote } from "./invoice-currency"

/** ECB reference rates via Frankfurter, published once per business day. */
export async function fetchExchangeRate(
  from: string,
  to: string,
  init: RequestInit & { next?: { revalidate?: number } } = { cache: "no-store" }
): Promise<ExchangeQuote> {
  if (!isCurrencyCode(from) || !isCurrencyCode(to)) {
    throw new Error("Unsupported currency")
  }
  if (from === to) return { rate: 1, date: new Date().toISOString().slice(0, 10) }

  const res = await fetch(
    `https://api.frankfurter.dev/v1/latest?from=${from}&to=${to}`,
    { ...init, signal: AbortSignal.timeout(10_000) }
  )
  if (!res.ok) throw new Error(`Exchange rate service returned ${res.status}`)
  const data = (await res.json()) as { date?: unknown; rates?: Record<string, unknown> }
  const rate = data.rates?.[to]
  if (typeof rate !== "number" || !(rate > 0)) throw new Error("Rate not found")
  return { rate, date: typeof data.date === "string" ? data.date : "" }
}

export function rateErrorMessage(currency: string): string {
  return `Couldn't get today's USD→${currency} exchange rate, so the invoice wasn't issued. Try again in a minute.`
}
