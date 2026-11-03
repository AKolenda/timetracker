"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { formatCurrency } from "./format"
import { fetchQuote } from "./use-exchange-rate"

export const DISPLAY_CURRENCIES = ["USD", "CAD"] as const
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number]

// Currencies a project can bill in; each is converted into the chosen display currency.
const SOURCE_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"]
const STORAGE_KEY = "timetracker.displayCurrency"
const CHANGE_EVENT = "timetracker:display-currency"

// Set only when storage refuses a write, so the choice still holds until the page reloads.
let memoryChoice: DisplayCurrency | null = null

function readStored(): DisplayCurrency {
  if (memoryChoice) return memoryChoice
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === "CAD" ? "CAD" : "USD"
  } catch {
    return "USD"
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

interface DisplayCurrencyContext {
  currency: DisplayCurrency
  setCurrency: (currency: DisplayCurrency) => void
  /** Formats an amount held in `from` in the chosen currency, or as-is until the rate loads. */
  money: (amount: number, from?: string) => string
}

const Context = createContext<DisplayCurrencyContext | null>(null)

export function DisplayCurrencyProvider({ children }: { children: ReactNode }) {
  // The server render and first paint use USD; the saved choice applies right after.
  const currency = useSyncExternalStore(subscribe, readStored, () => "USD" as DisplayCurrency)
  const [rates, setRates] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false
    for (const from of SOURCE_CURRENCIES) {
      if (from === currency) continue
      fetchQuote(from, currency)
        .then((quote) => {
          if (!cancelled) setRates((prev) => ({ ...prev, [`${from}:${currency}`]: quote.rate }))
        })
        .catch(() => {
          // Without a rate the amount stays in its own currency, which is still correct.
        })
    }
    return () => {
      cancelled = true
    }
  }, [currency])

  const setCurrency = useCallback((next: DisplayCurrency) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
      memoryChoice = null
    } catch {
      memoryChoice = next
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  const money = useCallback(
    (amount: number, from = "USD") => {
      if (from === currency) return formatCurrency(amount, currency)
      const rate = rates[`${from}:${currency}`]
      return rate ? formatCurrency(amount * rate, currency) : formatCurrency(amount, from)
    },
    [currency, rates]
  )

  const value = useMemo(() => ({ currency, setCurrency, money }), [currency, setCurrency, money])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useMoney() {
  const value = useContext(Context)
  if (!value) throw new Error("useMoney must be used inside DisplayCurrencyProvider")
  return value
}
