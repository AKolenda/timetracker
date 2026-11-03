import { NextRequest, NextResponse } from "next/server"

import { fetchExchangeRate } from "@/lib/exchange-rate"
import { isCurrencyCode, type ExchangeQuote } from "@/lib/invoice-currency"

// ECB rates change once per business day; an hour keeps drafts on the current day's rate.
const ONE_HOUR = 3_600_000
const cache = new Map<string, ExchangeQuote & { ts: number }>()

export async function GET(request: NextRequest) {
  const from = (request.nextUrl.searchParams.get("from") || "USD").toUpperCase()
  const to = (request.nextUrl.searchParams.get("to") || "CAD").toUpperCase()
  if (!isCurrencyCode(from) || !isCurrencyCode(to)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 })
  }

  if (from === to) {
    return NextResponse.json({ from, to, rate: 1, cached: true })
  }

  const key = `${from}:${to}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < ONE_HOUR) {
    return NextResponse.json({ from, to, rate: hit.rate, date: hit.date, cached: true })
  }

  try {
    const quote = await fetchExchangeRate(from, to, { next: { revalidate: 3600 } })
    cache.set(key, { ...quote, ts: Date.now() })
    return NextResponse.json({ from, to, ...quote, cached: false })
  } catch {
    if (hit) {
      return NextResponse.json({ from, to, rate: hit.rate, date: hit.date, cached: true, stale: true })
    }
    return NextResponse.json(
      { error: "Failed to fetch exchange rate" },
      { status: 502 }
    )
  }
}
