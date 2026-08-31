import "server-only"

export const DEFAULT_AGENT_TIME_GAP_MINUTES = 15

// The Agent Time desktop service is intentionally private to the local network.
// Deployments may override this, but the VM can work without any cloud configuration.
const AGENT_TIME_URL = process.env.AGENT_TIME_REMOTE_URL || "http://10.40.40.10:8080/api/data"
const REQUEST_TIMEOUT_MS = 5_000
const MAX_GAP_MINUTES = 24 * 60

type AgentTimePayload = {
  now: number
  timezone: string
  projects: string[]
  intervals: AgentTimeInterval[]
}

type AgentTimeInterval = {
  start: number
  end: number
  agent: string
  project: string
  live: boolean
}

export type AgentTimeBlock = {
  id: string
  project: string
  start: string
  end: string
  durationSeconds: number
  activitySeconds: number
  agents: string[]
  live: boolean
}

export type AgentTimeImportData = {
  fetchedAt: string
  timezone: string
  projects: string[]
  gapMinutes: number
  intervals: AgentTimeBlock[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isValidInterval(value: unknown): value is AgentTimeInterval {
  return (
    isRecord(value) &&
    typeof value.start === "number" &&
    Number.isFinite(value.start) &&
    typeof value.end === "number" &&
    Number.isFinite(value.end) &&
    value.end > value.start &&
    typeof value.agent === "string" &&
    typeof value.project === "string" &&
    typeof value.live === "boolean"
  )
}

function payloadFromUnknown(value: unknown): AgentTimePayload {
  if (!isRecord(value) || !Array.isArray(value.projects) || !Array.isArray(value.intervals)) {
    throw new Error("Agent Time returned an unexpected response.")
  }

  return {
    now: typeof value.now === "number" && Number.isFinite(value.now) ? value.now : Date.now() / 1000,
    timezone: typeof value.timezone === "string" ? value.timezone : "",
    projects: value.projects.filter((project): project is string => typeof project === "string"),
    intervals: value.intervals.filter(isValidInterval),
  }
}

/** Reads Agent Time's server-side local-network endpoint. The URL is deliberately not client-configurable. */
export async function fetchAgentTime(): Promise<AgentTimePayload> {
  const response = await fetch(AGENT_TIME_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: process.env.AGENT_TIME_API_KEY
      ? { Authorization: `Bearer ${process.env.AGENT_TIME_API_KEY}` }
      : undefined,
  })

  if (!response.ok) {
    throw new Error(`Agent Time responded with ${response.status}.`)
  }

  return payloadFromUnknown(await response.json())
}

export function parseGapMinutes(value: string | null): number {
  if (value === null || value.trim() === "") return DEFAULT_AGENT_TIME_GAP_MINUTES

  const minutes = Number(value)
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_GAP_MINUTES) {
    throw new Error(`gapMinutes must be a whole number between 0 and ${MAX_GAP_MINUTES}.`)
  }

  return minutes
}

export function parseDateBoundary(value: string | null, boundary: "start" | "end"): number | null {
  if (value === null || value === "") return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${boundary === "start" ? "from" : "to"} must use YYYY-MM-DD.`)
  }

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${boundary === "start" ? "from" : "to"} must be a valid date.`)
  }

  if (boundary === "end") date.setDate(date.getDate() + 1)
  return date.getTime() / 1000
}

function unionSeconds(intervals: AgentTimeInterval[]): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  let total = 0
  let start = 0
  let end = 0

  for (const interval of sorted) {
    if (interval.start > end) {
      total += end - start
      start = interval.start
      end = interval.end
    } else {
      end = Math.max(end, interval.end)
    }
  }

  return total + end - start
}

function blockId(project: string, start: number, end: number): string {
  // Stable across refreshes; it is suitable for selection keys, not as a security token.
  let hash = 2166136261
  for (const char of `${project}:${start}:${end}`) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `agent-time-${(hash >>> 0).toString(36)}`
}

export function toImportData(
  payload: AgentTimePayload,
  options: { project: string | null; from: number | null; to: number | null; gapMinutes: number; includeLive: boolean }
): AgentTimeImportData {
  const gapSeconds = options.gapMinutes * 60
  const filtered = payload.intervals
    .filter((interval) => !options.project || interval.project === options.project)
    .filter((interval) => options.includeLive || !interval.live)
    .filter((interval) => options.from === null || interval.end > options.from)
    .filter((interval) => options.to === null || interval.start < options.to)
    .map((interval) => ({
      ...interval,
      start: Math.max(interval.start, options.from ?? -Infinity),
      end: Math.min(interval.end, options.to ?? Infinity),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.project.localeCompare(b.project) || a.start - b.start)

  const blocks: Array<{ project: string; start: number; end: number; intervals: AgentTimeInterval[] }> = []
  for (const interval of filtered) {
    const current = blocks.at(-1)
    if (current && current.project === interval.project && interval.start <= current.end + gapSeconds) {
      current.end = Math.max(current.end, interval.end)
      current.intervals.push(interval)
    } else {
      blocks.push({ project: interval.project, start: interval.start, end: interval.end, intervals: [interval] })
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    timezone: payload.timezone,
    projects: [...new Set(payload.projects)].sort((a, b) => a.localeCompare(b)),
    gapMinutes: options.gapMinutes,
    intervals: blocks
      .map((block) => ({
        id: blockId(block.project, block.start, block.end),
        project: block.project,
        start: new Date(block.start * 1000).toISOString(),
        end: new Date(block.end * 1000).toISOString(),
        durationSeconds: Math.round(block.end - block.start),
        activitySeconds: Math.round(unionSeconds(block.intervals)),
        agents: [...new Set(block.intervals.map((interval) => interval.agent))].sort(),
        live: block.intervals.some((interval) => interval.live),
      }))
      .filter((block) => block.durationSeconds > 0),
  }
}
