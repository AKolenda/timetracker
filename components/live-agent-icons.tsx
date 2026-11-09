"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SourceLogo, T3ThreadId } from "@/components/entry-chat-audit"

export type LiveAgentWork = {
  key: string
  projectId?: string
  projectName?: string
  folder: string
  folderTitle?: string
  title: string
  agents: string[]
  machines: string[]
  threadId?: string
  start: string
}

function formatLiveTotal(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

function LiveAgentClock({ start }: { start: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [start])
  const seconds = now === null ? 0 : Math.max(0, Math.floor((now - Date.parse(start)) / 1000))
  return <span className="font-mono text-sm font-semibold tabular-nums">{formatLiveTotal(seconds)}</span>
}

/** One agent logo per T3 thread working right now. Hover or tap one for its details and to choose its project. */
export function LiveAgentIcons({ work, renderProjectPicker }: { work: LiveAgentWork[]; renderProjectPicker: (item: LiveAgentWork) => ReactNode }) {
  const [requestedKey, setOpenKey] = useState<string | null>(null)
  // A tap or a click keeps the details open; hovering alone closes them when the pointer leaves.
  const [requestedPin, setPinned] = useState(false)
  const closeTimer = useRef<number | null>(null)
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current) }, [])
  // A thread that finishes while its details are open leaves nothing open or pinned.
  const openKey = work.some((item) => item.key === requestedKey) ? requestedKey : null
  const pinned = openKey !== null && requestedPin

  function cancelClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  function hoverOpen(key: string, pointerType: string) {
    if (pointerType !== "mouse" || (pinned && openKey !== key)) return
    cancelClose()
    setOpenKey(key)
  }
  function hoverClose(pointerType: string) {
    if (pointerType !== "mouse" || pinned) return
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpenKey(null), 200)
  }

  const working = work.length === 1 ? "1 agent working" : `${work.length} agents working`
  return <div className="flex flex-wrap items-center gap-2" data-testid="live-agent-work" aria-label="Agents working now">
    <span className="mr-1 text-xs text-muted-foreground">{working}</span>
    {work.map((item) => {
      const agent = item.agents.join(" + ") || "Agent"
      const projectLabel = item.projectName ?? item.folder
      return <Popover key={item.key} open={openKey === item.key} onOpenChange={(open) => {
        cancelClose()
        // Opening is handled by the trigger itself; this only hears Escape and clicks outside.
        if (!open && openKey === item.key) { setOpenKey(null); setPinned(false) }
      }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="live-agent-icon"
            aria-label={`${item.title}: ${agent} working on ${projectLabel}${item.projectName ? "" : ", not linked to a project"}`}
            className={`relative grid size-10 shrink-0 place-items-center rounded-md border bg-muted/30 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-muted ${item.projectName ? "" : "border-warning/60"}`}
            onPointerEnter={(event) => hoverOpen(item.key, event.pointerType)}
            onPointerLeave={(event) => hoverClose(event.pointerType)}
            onClick={(event) => {
              // A click on details opened by hovering keeps them open instead of toggling them shut.
              event.preventDefault()
              cancelClose()
              if (openKey === item.key && pinned) { setOpenKey(null); setPinned(false) } else { setOpenKey(item.key); setPinned(true) }
            }}
          >
            <SourceLogo source="" agent={item.agents[0] ?? "Claude"} className="size-7" />
            <span className="absolute -top-1 -right-1 size-2.5 animate-pulse rounded-full border-2 border-background bg-emerald-500" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(22rem,calc(100vw-2rem))] gap-3 p-3"
          align="start"
          collisionPadding={16}
          data-testid="live-agent-details"
          onOpenAutoFocus={(event) => { if (!pinned) event.preventDefault() }}
          onPointerEnter={(event) => { if (event.pointerType === "mouse") cancelClose() }}
          onPointerLeave={(event) => hoverClose(event.pointerType)}
          onPointerDown={() => setPinned(true)}
        >
          <div className="flex items-start gap-2.5">
            <SourceLogo source="" agent={item.agents[0] ?? "Claude"} className="mt-0.5 size-6" />
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words">{item.title}</p>
              <p className="text-xs text-muted-foreground">
                {item.projectName ?? <>{item.folderTitle ?? item.folder} · <span className="text-warning">not linked to a project</span></>}
                {item.machines.length > 0 && <> · {item.machines.join(", ")}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">{agent} working</span>
            <LiveAgentClock start={item.start} />
          </div>
          {item.threadId && <T3ThreadId id={item.threadId} />}
          <div className="grid gap-1.5">
            <p className="text-xs text-muted-foreground">Bill <span className="font-medium text-foreground">{item.folderTitle ?? item.folder}</span> to</p>
            {renderProjectPicker(item)}
          </div>
          <p className="text-xs text-muted-foreground">Becomes a draft to approve when this turn finishes.</p>
        </PopoverContent>
      </Popover>
    })}
  </div>
}
