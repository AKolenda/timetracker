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

function buildFavicon(state: "running" | "paused" | "idle"): string {
  const size = 64
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  ctx.fillStyle = state === "running" ? "#dc2626" : state === "paused" ? "#d97706" : "#0a0a0a"
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, 14)
  ctx.fill()

  ctx.strokeStyle = "#ffffff"
  ctx.fillStyle = "#ffffff"
  ctx.lineWidth = 5
  ctx.lineCap = "round"
  const cx = size / 2
  const cy = size / 2
  const r = 18

  if (state === "paused") {
    // Draw pause bars
    const barW = 7
    const barH = 26
    const gap = 5
    ctx.fillRect(cx - gap - barW, cy - barH / 2, barW, barH)
    ctx.fillRect(cx + gap, cy - barH / 2, barW, barH)
  } else {
    // Draw stopwatch
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
  }

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
  const timer = data.activeTimers.find((item) => !item.pausedAt) ?? data.activeTimers[0]
  const additionalTimers = Math.max(0, data.activeTimers.length - 1)

  const defaultFaviconRef = useRef<string | null>(null)
  const runningFaviconRef = useRef<string | null>(null)
  const pausedFaviconRef = useRef<string | null>(null)

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
      runningFaviconRef.current = buildFavicon("running")
    }
    if (!pausedFaviconRef.current) {
      pausedFaviconRef.current = buildFavicon("paused")
    }

    const isPaused = !!timer.pausedAt
    const activeFavicon = isPaused ? pausedFaviconRef.current : runningFaviconRef.current

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
      const now = Date.now()
      let totalPaused = timer.accumulatedPause ? timer.accumulatedPause * 1000 : 0
      if (timer.pausedAt) {
        totalPaused += now - new Date(timer.pausedAt).getTime()
      }
      const elapsed = now - new Date(timer.startTime).getTime() - totalPaused
      const prefix = isPaused ? "⏸ " : ""
      document.title = `${prefix}${formatElapsed(Math.max(0, elapsed))} — ${label}${additionalTimers ? ` +${additionalTimers}` : ""} | ${DEFAULT_TITLE}`
      if (activeFavicon) {
        setFavicon(activeFavicon)
      }
    }

    tick()
    // When paused, tick less frequently (just for favicon recovery)
    const id = window.setInterval(tick, isPaused ? 5000 : 1000)

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
        activeFavicon &&
        (!link || link.href !== activeFavicon)
      ) {
        setFavicon(activeFavicon)
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
  }, [timer, additionalTimers, getProject, getClient])

  return null
}
