"use client"

import { DISPLAY_CURRENCIES, useMoney } from "@/lib/display-currency"
import { cn } from "@/lib/utils"

/**
 * The main currency switch: shows every list, total, and dashboard amount in USD or CAD.
 * `PageHeader` places it for you (inline from `sm` up, inside More on phones);
 * pass `className="w-full"` to stretch it across a sheet.
 */
export function CurrencyToggle({ className }: { className?: string }) {
  const { currency, setCurrency } = useMoney()
  return (
    <div
      role="group"
      aria-label="Display currency"
      className={cn("inline-flex shrink-0 items-center rounded-md border bg-muted/40 p-0.5", className)}
    >
      {DISPLAY_CURRENCIES.map((code) => (
        <button
          key={code}
          type="button"
          data-slot="currency-option"
          aria-pressed={currency === code}
          onClick={() => setCurrency(code)}
          className={cn(
            "min-w-11 flex-1 rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:min-h-9 pointer-coarse:px-3 pointer-coarse:text-sm",
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
