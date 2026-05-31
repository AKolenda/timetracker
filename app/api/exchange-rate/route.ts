import { NextRequest, NextResponse } from "next/server"

// Cache the rate in-memory so repeated client requests within the same
// serverless invocation don't re-fetch. The outer Next.js fetch cache
// (revalidate: 86400) handles cross-invocation caching on Vercel.
let cached: { from: string; to: string; rate: number; ts: number } | null = null
const ONE_DAY = 86_400_000

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") || "USD"
  const to = request.nextUrl.searchParams.get("to") || "CAD"

  if (from === to) {
    return NextResponse.json({ from, to, rate: 1, cached: true })
  }

  // Return in-memory cache if fresh
  if (
    cached &&
    cached.from === from &&
    cached.to === to &&
    Date.now() - cached.ts < ONE_DAY
  ) {
    return NextResponse.json({ from, to, rate: cached.rate, cached: true })
  }

  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { next: { revalidate: 86400 } }
    )
    if (!res.ok) throw new Error(`Frankfurter API ${res.status}`)
    const data = await res.json()
    const rate = data.rates?.[to]
    if (typeof rate !== "number") throw new Error("Rate not found")

    cached = { from, to, rate, ts: Date.now() }
    return NextResponse.json({ from, to, rate, date: data.date, cached: false })
  } catch (err) {
    // Fallback: return stale cache if available
    if (cached && cached.from === from && cached.to === to) {
      return NextResponse.json({ from, to, rate: cached.rate, cached: true, stale: true })
    }
    return NextResponse.json(
      { error: "Failed to fetch exchange rate" },
      { status: 502 }
    )
  }
}
