"use client"

import { useEffect, useRef } from "react"
import { useStore } from "@/lib/store"

const DEFAULT_TITLE = "TimeTracker"

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

function buildFavicon(running: boolean): string {
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  ctx.fillStyle = running ? "#dc2626" : "#0a0a0a"
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, 14)
  ctx.fill()

  ctx.strokeStyle = "#ffffff"
  ctx.lineWidth = 5
  ctx.lineCap = "round"
  const cx = size / 2
  const cy = size / 2
  const r = 18

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx, cy - r + 4)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + r - 8, cy)
  ctx.stroke()

  return canvas.toDataURL("image/png")
}

function setFavicon(href: string) {
  if (!href) return
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
  if (!link) {
    link = document.createElement("link")
    link.rel = "icon"
    document.head.appendChild(link)
  }
  link.type = "image/png"
  link.href = href
}

export function TimerTabIndicator() {
  const { data, getProject, getClient } = useStore()
  const timer = data.activeTimer

  const defaultFaviconRef = useRef<string | null>(null)
  const runningFaviconRef = useRef<string | null>(null)

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
    if (link && !defaultFaviconRef.current) {
      defaultFaviconRef.current = link.href
    }
  }, [])

  useEffect(() => {
    if (!timer) {
      document.title = DEFAULT_TITLE
      if (defaultFaviconRef.current) {
        setFavicon(defaultFaviconRef.current)
      }
      return
    }

    if (!runningFaviconRef.current) {
      runningFaviconRef.current = buildFavicon(true)
    }

    const project = getProject(timer.projectId)
    const client = project ? getClient(project.clientId) : undefined
    const label = [client?.name, project?.name].filter(Boolean).join(" / ") ||
      timer.description ||
      "Tracking"

    // Re-apply the favicon on every tick. Chrome's tab-discard / Memory Saver
    // can wipe the custom favicon (reverting to the HTML default) after the
    // tab has been backgrounded for several minutes. Re-setting link.href to
    // the same cached data URL is cheap and keeps the stopwatch sticky.
    const tick = () => {
      const elapsed = Date.now() - new Date(timer.startTime).getTime()
      document.title = `${formatElapsed(elapsed)} — ${label} | ${DEFAULT_TITLE}`
      if (runningFaviconRef.current) {
        setFavicon(runningFaviconRef.current)
      }
    }

    tick()
    const id = window.setInterval(tick, 1000)

    // When the tab becomes visible/focused again, force an immediate tick so
    // we recover instantly from background-timer throttling (Chrome clamps
    // setInterval to ~1/min after 5 min hidden) or tab freezing.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick()
    }
    const onFocus = () => tick()
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onFocus)
    window.addEventListener("pageshow", onFocus)

    // Defensive: if anything else (e.g. Chrome on tab unfreeze) rewrites
    // <link rel="icon">, immediately put ours back.
    const head = document.head
    const observer = new MutationObserver(() => {
      const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
      if (
        runningFaviconRef.current &&
        (!link || link.href !== runningFaviconRef.current)
      ) {
        setFavicon(runningFaviconRef.current)
      }
    })
    observer.observe(head, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] })

    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("pageshow", onFocus)
      observer.disconnect()
    }
  }, [timer, getProject, getClient])

  return null
}
