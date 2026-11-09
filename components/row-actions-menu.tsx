"use client"

import { Ellipsis, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export interface RowAction {
  label: string
  icon: LucideIcon
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
  /** Test id for the desktop button; the phone menu item gets `<testId>-phone`. */
  testId?: string
  /** Extra classes for the desktop icon button, such as a tone colour. */
  className?: string
}

export interface RowActionsMenuProps {
  /** The record's name, used for the phone trigger's label: "Actions for <name>". */
  name: string
  items: RowAction[]
  /** Size of the desktop inline icon buttons. Defaults to `icon-xs`. */
  desktopSize?: "icon-xs" | "icon-sm" | "icon"
  className?: string
}

/**
 * A list row's actions. On phones it is one 44px ⋯ button opening a menu of
 * 44px items; from `sm` up it renders the same actions as inline icon buttons,
 * so desktop keeps one-click actions. Use it for any row with two or more
 * icon actions (edit, delete, resume…).
 */
export function RowActionsMenu({ name, items, desktopSize = "icon-xs", className }: RowActionsMenuProps) {
  return (
    <div data-slot="row-actions" className={cn("flex shrink-0 items-center", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground sm:hidden"
            aria-label={`Actions for ${name}`}
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          {items.map((item) => (
            <DropdownMenuItem
              key={item.label}
              variant={item.destructive ? "destructive" : "default"}
              disabled={item.disabled}
              data-testid={item.testId ? `${item.testId}-phone` : undefined}
              className="min-h-11 gap-2.5"
              onSelect={item.onSelect}
            >
              <item.icon aria-hidden />
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="hidden items-center gap-0.5 sm:flex">
        {items.map((item) => (
          <Button
            key={item.label}
            variant="ghost"
            size={desktopSize}
            data-testid={item.testId}
            disabled={item.disabled}
            aria-label={item.label}
            title={item.label}
            className={item.className}
            onClick={item.onSelect}
          >
            <item.icon className={desktopSize === "icon-xs" ? "size-3.5" : undefined} />
          </Button>
        ))}
      </div>
    </div>
  )
}
