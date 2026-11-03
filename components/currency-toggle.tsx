"use client"

import { DISPLAY_CURRENCIES, useMoney } from "@/lib/display-currency"
import { cn } from "@/lib/utils"

/** Switches every list, total, and dashboard amount between USD and CAD. */
export function CurrencyToggle() {
  const { currency, setCurrency } = useMoney()
  return (
    <div
      role="group"
      aria-label="Display currency"
      className="inline-flex shrink-0 items-center rounded-md border bg-muted/40 p-0.5"
    >
      {DISPLAY_CURRENCIES.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={currency === code}
          onClick={() => setCurrency(code)}
          className={cn(
            "rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            currency === code
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {code}
        </button>
      ))}
    </div>
  )
}
