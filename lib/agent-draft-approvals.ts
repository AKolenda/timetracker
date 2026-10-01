import { occupiedProjectRanges, subtractRanges, type RunningRange, type TrackedRange } from "./agent-time-overlap.ts"
import { splitAgentRange } from "./agent-time-intervals.ts"
import type { TimeEntry } from "./types.ts"

export function draftApprovalKey(entry: Pick<TimeEntry, "projectId" | "startTime" | "endTime">) {
  return JSON.stringify([entry.projectId, entry.startTime, entry.endTime])
}

/** Plan and reserve all gaps before any save can yield to another approval. */
export function reserveDraftEntries(
  entries: Omit<TimeEntry, "id">[],
  occupied: TrackedRange[],
  timers: RunningRange[],
  maxMinutes?: number | null,
): TimeEntry[] {
  const reserved: TimeEntry[] = []
  for (const entry of entries) {
    const gaps = subtractRanges(
      { start: Date.parse(entry.startTime), end: Date.parse(entry.endTime!) },
      occupiedProjectRanges(entry.projectId, [...occupied, ...reserved], timers),
    )
    for (const gap of gaps.flatMap((range) => splitAgentRange(range, maxMinutes))) {
      const duration = Math.floor((gap.end - gap.start) / 1000)
      if (duration <= 0) continue
      reserved.push({ ...entry, id: crypto.randomUUID(), startTime: new Date(gap.start).toISOString(), endTime: new Date(gap.end).toISOString(), duration })
    }
  }
  return reserved
}
