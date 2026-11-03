"use client"

import { useEffect, useState } from "react"

import type { ExchangeQuote } from "./invoice-currency"

interface ExchangeRate {
  from: string
  to: string
  rate: number
  date?: string
  cached: boolean
}

export async function fetchQuote(from: string, to: string): Promise<ExchangeQuote> {
  const res = await fetch(
    `/api/exchange-rate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  )
  const body = (await res.json().catch(() => ({}))) as Partial<ExchangeRate>
  if (!res.ok || typeof body.rate !== "number") {
    throw new Error(`Couldn't get the ${from}→${to} exchange rate`)
  }
  return { rate: body.rate, date: body.date ?? "" }
}

export function useExchangeRate(from: string, to: string | null | undefined) {
  const [data, setData] = useState<ExchangeRate | null>(null)

  useEffect(() => {
    if (!from || !to || from === to) return
    let cancelled = false
    fetch(`/api/exchange-rate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.rate) setData(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [from, to])

  // A previous pair's rate is never returned for the current one.
  const quote: ExchangeQuote | null =
    data && to && data.from === from && data.to === to
      ? { rate: data.rate, date: data.date ?? "" }
      : null
  return { rate: quote?.rate ?? null, quote }
}
