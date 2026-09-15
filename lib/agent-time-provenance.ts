import type { AgentTimeSourceInterval } from "./agent-time"

/** Store only the activity belonging to the approved interval. */
export function clipAgentSources(sources: AgentTimeSourceInterval[], start: number, end: number): AgentTimeSourceInterval[] {
  return sources.flatMap((source) => {
    const clippedStart = Math.max(Date.parse(source.start), start)
    const clippedEnd = Math.min(Date.parse(source.end), end)
    if (!Number.isFinite(clippedStart) || !Number.isFinite(clippedEnd) || clippedEnd <= clippedStart) return []
    return [{ ...source, start: new Date(clippedStart).toISOString(), end: new Date(clippedEnd).toISOString(), durationSeconds: Math.round((clippedEnd - clippedStart) / 1000) }]
  })
}
