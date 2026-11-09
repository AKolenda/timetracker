"use client"

import * as React from "react"
import { Ellipsis, XIcon, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface MoreSheetContextValue {
  /** Closes the sheet, then runs `action` once it has finished closing. */
  closeThen: (action: () => void) => void
}

const MoreSheetContext = React.createContext<MoreSheetContextValue | null>(null)

export interface MoreSheetProps {
  /** How many narrowing filters are set; shows a badge on the door when above 0. */
  count?: number
  /** Resets those filters; shows a "Clear" button in the sheet header when set. */
  onClear?: () => void
  /** Sheet heading. Defaults to "More". */
  title?: string
  /** Extra classes for the trigger button. */
  className?: string
  children: React.ReactNode
}

/**
 * The phone "More" door and its bottom sheet. Use it for everything a phone
 * toolbar can't hold on its one row: filters, selects, view switchers,
 * secondary actions and summary figures. `PageHeader` renders one for you from
 * its `more` prop; render it directly only outside a page header.
 * Lay out the contents with `SheetSection` (labelled controls) and
 * `SheetAction` (full-width action rows).
 */
export function MoreSheet({ count, onClear, title = "More", className, children }: MoreSheetProps) {
  const [open, setOpen] = React.useState(false)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const pendingAction = React.useRef<(() => void) | null>(null)

  const context = React.useMemo<MoreSheetContextValue>(
    () => ({
      closeThen: (action) => {
        pendingAction.current = action
        setOpen(false)
      },
    }),
    []
  )

  const runPendingAction = (event: Event) => {
    const action = pendingAction.current
    if (!action) return
    pendingAction.current = null
    // The action may open a dialog or navigate; don't pull focus back to the door.
    event.preventDefault()
    action()
  }

  const active = (count ?? 0) > 0

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-11 gap-1.5 px-3 max-[359px]:px-2.5", className)}
          data-testid="page-more"
        >
          <Ellipsis aria-hidden className="size-4" />
          <span className="max-[359px]:sr-only">More</span>
          {active && (
            <span className="rounded-md bg-primary px-1.5 text-xs leading-5 font-medium text-primary-foreground tabular-nums">
              {count}
              <span className="sr-only"> active</span>
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        ref={contentRef}
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-h-[85dvh] gap-0 overflow-y-auto overscroll-contain rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        onOpenAutoFocus={(event) => {
          // Focus the sheet itself, not its first field, so the phone keyboard stays down.
          event.preventDefault()
          contentRef.current?.focus()
        }}
        onCloseAutoFocus={runPendingAction}
      >
        <div className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-popover pr-2 pl-4">
          <SheetTitle className="min-w-0 flex-1 truncate text-sm font-medium">{title}</SheetTitle>
          {onClear && (
            <Button variant="ghost" className="h-11 px-3 text-muted-foreground" disabled={!active} onClick={onClear}>
              Clear
            </Button>
          )}
          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="size-11" aria-label="Close">
              <XIcon />
            </Button>
          </SheetClose>
        </div>
        <MoreSheetContext.Provider value={context}>
          <div className="flex flex-col py-1">{children}</div>
        </MoreSheetContext.Provider>
      </SheetContent>
    </Sheet>
  )
}

export interface SheetSectionProps {
  label: string
  className?: string
  children: React.ReactNode
}

/**
 * A labelled group of controls inside a `MoreSheet`, such as a filter, a
 * select or the currency toggle. Controls stack full width, and every button,
 * input and select inside is at least 44px tall.
 */
export function SheetSection({ label, className, children }: SheetSectionProps) {
  const id = React.useId()
  return (
    <section aria-labelledby={id} className={cn("px-4 py-2.5", className)}>
      <h3 id={id} className="mb-1.5 text-xs font-medium text-muted-foreground">
        {label}
      </h3>
      <div
        className={cn(
          "flex flex-col gap-2",
          "[&_[data-slot=button]]:min-h-11 [&_[data-slot=input]]:h-11 [&_[data-slot=select-trigger]]:h-11! [&_[data-slot=select-trigger]]:w-full [&_[data-slot=popover-trigger]]:min-h-11 [&_[data-slot=currency-option]]:min-h-11",
          "*:data-[slot=button]:w-full"
        )}
      >
        {children}
      </div>
    </section>
  )
}

export interface SheetActionProps {
  icon: LucideIcon
  label: string
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
  testId?: string
  /** Optional trailing text, such as a count. */
  detail?: React.ReactNode
}

/**
 * A full-width 44px action row inside a `MoreSheet`, for secondary page
 * actions (Refresh, Review drafts, Export…). It closes the sheet, then runs
 * `onSelect`, so a dialog it opens doesn't fight the closing sheet for focus.
 */
export function SheetAction({ icon: Icon, label, onSelect, destructive, disabled, testId, detail }: SheetActionProps) {
  const context = React.useContext(MoreSheetContext)
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={() => (context ? context.closeThen(onSelect) : onSelect())}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 border-b px-4 text-left text-sm outline-none last:border-b-0 hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-50",
        destructive && "text-destructive"
      )}
    >
      <Icon aria-hidden className={cn("size-4 shrink-0", destructive ? "text-destructive" : "text-muted-foreground")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail != null && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{detail}</span>}
    </button>
  )
}
