import * as React from "react"

type FocusEventHandler = (event: Event) => void

/**
 * Most dialogs here open from a plain button or a menu item rather than a Radix Trigger, so Radix has
 * nothing to return focus to. Remember what had focus on each opening (before focus moves in) and go back
 * to it on close; a menu item unmounts with its menu, so use the button that opened the menu instead.
 */
export function useReturnFocus(onOpenAutoFocus?: FocusEventHandler, onCloseAutoFocus?: FocusEventHandler) {
  const openerRef = React.useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: (event: Event) => {
      let opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      const menu = opener?.closest<HTMLElement>('[role="menu"]')
      if (menu?.id) opener = document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(menu.id)}"]`) ?? opener
      openerRef.current = opener
      onOpenAutoFocus?.(event)
    },
    onCloseAutoFocus: (event: Event) => {
      onCloseAutoFocus?.(event)
      const opener = openerRef.current
      openerRef.current = null
      if (event.defaultPrevented || !opener || opener === document.body || !opener.isConnected) return
      event.preventDefault()
      opener.focus()
    },
  }
}
