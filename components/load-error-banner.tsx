"use client"

import { useState } from "react"
import { AlertTriangle, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useStore } from "@/lib/store"

/** Says plainly that data failed to load, so an empty screen is never mistaken for lost data. */
export function LoadErrorBanner() {
  const { loadError, refresh } = useStore()
  const [retrying, setRetrying] = useState(false)
  if (!loadError) return null
  return (
    <div role="alert" className="-mt-2 mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
      <AlertTriangle aria-hidden className="size-4 shrink-0 text-destructive" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Couldn’t load your data.</span>{" "}
        <span className="text-muted-foreground">Nothing has been deleted. Check the connection and try again.</span>
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={retrying}
        onClick={async () => {
          setRetrying(true)
          try { await refresh() } finally { setRetrying(false) }
        }}
      >
        <RotateCw className={retrying ? "animate-spin" : undefined} />
        Retry
      </Button>
    </div>
  )
}
