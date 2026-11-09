import Link from "next/link"
import type { LucideIcon } from "lucide-react"

import { CurrencyToggle } from "@/components/currency-toggle"
import { LoadErrorBanner } from "@/components/load-error-banner"
import { MoreSheet, SheetSection } from "@/components/more-sheet"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

/** The page's one main action, drawn icon-only on phones. */
export interface PageHeaderPrimary {
  /** Accessible name, such as "New invoice". */
  label: string
  icon: LucideIcon
  onClick?: () => void
  /** Renders a link instead of a button. */
  href?: string
  disabled?: boolean
  /** Base test id; the phone button gets `<testId>-phone`. */
  testId?: string
}

export interface PageHeaderProps {
  title: string
  /**
   * Desktop toolbar buttons, shown inline from `sm` up. Hidden on phones once the
   * page passes `primary`, `more` or `center`; until then they stay on the phone row.
   */
  actions?: React.ReactNode
  /** Shows the USD/CAD switch: inline from `sm` up, inside More on phones. Off for pages without amounts. */
  currencyToggle?: boolean
  /** Replaces the title on phones, such as a search field or a month/section picker. */
  center?: React.ReactNode
  /** Also shows `center` in the row from `sm` up, between the title and `actions`. Off by default. */
  centerOnDesktop?: boolean
  /** Phone-only icon button for the page's main action; desktop keeps its labelled button in `actions`. */
  primary?: PageHeaderPrimary
  /** Phone-only bottom-sheet contents: filters, secondary actions, summary figures. Use `SheetSection` and `SheetAction`. */
  more?: React.ReactNode
  /** Number of non-default filters inside `more`, shown as a badge on the More button. */
  moreCount?: number
  /** Resets the filters inside `more`; adds a "Clear" button to the sheet. */
  onMoreClear?: () => void
}

/**
 * The one sticky chrome row at the top of every page.
 *
 * Phones (below `sm`): `[☰] [center ?? title] [More] [primary]` on one 56px
 * row. `actions` and the currency toggle are hidden there; the toggle and
 * `more` move into the More sheet. (A page that passes none of `primary`,
 * `more` or `center` keeps its `actions` on the phone row.) From `sm` up: `[☰] title … actions
 * [currency]`, as before, with More and the phone primary hidden.
 * Layout is gated with CSS, so the first paint is already right.
 */
export function PageHeader({
  title,
  actions,
  currencyToggle = true,
  center,
  centerOnDesktop = false,
  primary,
  more,
  moreCount,
  onMoreClear,
}: PageHeaderProps) {
  const showMore = Boolean(more) || currencyToggle
  // Pages that haven't adopted the phone props keep their buttons on the row
  // (scrolling sideways rather than wrapping) until they do.
  const adopted = primary != null || more != null || center != null

  return (
    <>
      <header
        data-slot="page-header"
        className="sticky top-0 z-20 -mx-4 mb-3 flex h-14 flex-nowrap items-center gap-2 border-b bg-background px-4 sm:-mx-6 sm:mb-6 sm:h-12 sm:gap-3 sm:px-6 md:rounded-t-lg"
      >
        <SidebarTrigger className="-ml-1.5 shrink-0 text-muted-foreground max-sm:-ml-2.5" />
        <h1 className={cn("min-w-0 truncate text-sm font-medium max-sm:flex-1", center != null && "max-sm:hidden", !adopted && "max-sm:min-w-16")}>
          {title}
        </h1>
        {center != null && (
          <div className={cn("flex min-w-0 flex-1 items-center", !centerOnDesktop && "sm:hidden")}>{center}</div>
        )}
        {(actions || currencyToggle) && (
          <div
            className={cn(
              "ml-auto flex min-w-0 shrink-0 flex-nowrap items-center justify-end gap-2",
              adopted || !actions
                ? "max-sm:hidden"
                : "max-sm:shrink max-sm:overflow-x-auto max-sm:[scrollbar-width:none]"
            )}
          >
            {actions}
            {currencyToggle && <span className="contents max-sm:hidden"><CurrencyToggle /></span>}
          </div>
        )}
        {showMore && (
          <div className="flex shrink-0 sm:hidden">
            <MoreSheet count={moreCount} onClear={onMoreClear} title={title}>
              {currencyToggle && (
                <SheetSection label="Currency">
                  <CurrencyToggle className="w-full" />
                </SheetSection>
              )}
              {more}
            </MoreSheet>
          </div>
        )}
        {primary && <PhonePrimary {...primary} />}
      </header>
      <LoadErrorBanner />
    </>
  )
}

function PhonePrimary({ label, icon: Icon, onClick, href, disabled, testId }: PageHeaderPrimary) {
  const className = "size-11 shrink-0 sm:hidden"
  const phoneTestId = testId ? `${testId}-phone` : undefined
  if (href && !disabled) {
    return (
      <Button asChild size="icon" className={className}>
        <Link href={href} aria-label={label} title={label} data-testid={phoneTestId} onClick={onClick}>
          <Icon />
        </Link>
      </Button>
    )
  }
  return (
    <Button
      size="icon"
      className={className}
      aria-label={label}
      title={label}
      disabled={disabled}
      data-testid={phoneTestId}
      onClick={onClick}
    >
      <Icon />
    </Button>
  )
}
