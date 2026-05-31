"use client"

import { useEffect, useState } from "react"

interface ExchangeRate {
  from: string
  to: string
  rate: number
  cached: boolean
}

export function useExchangeRate(from: string, to: string) {
  const [data, setData] = useState<ExchangeRate | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!from || !to || from === to) {
      setData(null)
      return
    }

    setLoading(true)
    fetch(`/api/exchange-rate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.rate) setData(d)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [from, to])

  return { rate: data?.rate ?? null, loading }
}
