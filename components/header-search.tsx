"use client"

import { Search, X } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface HeaderSearchProps {
  value: string
  onChange: (value: string) => void
  /** What is searched, for the placeholder: "invoices" reads "Search invoices". */
  noun: string
  /** Accessible name when it should say more than the placeholder. */
  label?: string
  testId?: string
  className?: string
}

/**
 * The one search field for the phone header row (`PageHeader` `center`):
 * a search icon, 16px text so iOS doesn't zoom, 44px tall, and a clear button
 * once it holds a value.
 */
export function HeaderSearch({ value, onChange, noun, label, testId, className }: HeaderSearchProps) {
  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`Search ${noun}`}
        aria-label={label ?? `Search ${noun}`}
        data-testid={testId}
        className={cn(
          "h-11 min-w-0 rounded-md pl-9 text-[16px] [&::-webkit-search-cancel-button]:appearance-none",
          value && "pr-11"
        )}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  )
}
