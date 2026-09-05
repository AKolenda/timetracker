export type TimeRange = { start: number; end: number }

/** Returns only the portions of a source interval not covered by tracked time. */
export function subtractRanges(source: TimeRange, occupied: TimeRange[]): TimeRange[] {
  let cursor = source.start
  const uncovered: TimeRange[] = []

  for (const range of [...occupied].sort((a, b) => a.start - b.start)) {
    if (range.end <= cursor || range.start >= source.end) continue
    if (range.start > cursor) {
      uncovered.push({ start: cursor, end: Math.min(range.start, source.end) })
    }
    cursor = Math.max(cursor, range.end)
    if (cursor >= source.end) break
  }

  if (cursor < source.end) uncovered.push({ start: cursor, end: source.end })
  return uncovered.filter((range) => range.end > range.start)
}

export type TrackedRange = {
  id: string
  projectId: string
  startTime: string
  endTime: string | null
}
export type RunningRange = { id: string; projectId: string; startTime: string }

export function occupiedProjectRanges(
  projectId: string,
  entries: TrackedRange[],
  timers: RunningRange[] = []
): TimeRange[] {
  return [
    ...entries.filter((entry) => entry.projectId === projectId && entry.endTime)
      .map((entry) => ({ start: Date.parse(entry.startTime), end: Date.parse(entry.endTime!) })),
    // Reserve the open interval until the timer is stopped, including paused timers:
    // pause history is not stored, so it cannot safely be subtracted.
    ...timers.filter((timer) => timer.projectId === projectId)
      .map((timer) => ({ start: Date.parse(timer.startTime), end: Infinity })),
  ].filter((range) => Number.isFinite(range.start) && !Number.isNaN(range.end) && range.end > range.start)
}

// Ignore up to five minutes of overlap when warning about timer handoffs.
// Import subtraction remains exact to avoid counting any tracked time twice.
const OVERLAP_WARNING_TOLERANCE_MS = 5 * 60_000

export function overlappingEntryIds(entries: TrackedRange[], timers: RunningRange[] = [], now = Date.now()): Set<string> {
  const conflicts = new Set<string>()
  for (const entry of entries) {
    if (!entry.endTime) continue // Hours-only entries have no known interval.
    const source = { start: Date.parse(entry.startTime), end: Date.parse(entry.endTime) }
    if (!Number.isFinite(source.start) || !Number.isFinite(source.end) || source.end <= source.start) continue
    const occupied = occupiedProjectRanges(entry.projectId, entries.filter((other) => other.id !== entry.id))
    occupied.push(...timers.filter((timer) => timer.projectId === entry.projectId)
      .map((timer) => ({ start: Date.parse(timer.startTime), end: now })))
    if (occupied.some((range) => Math.min(range.end, source.end) - Math.max(range.start, source.start) > OVERLAP_WARNING_TOLERANCE_MS)) conflicts.add(entry.id)
  }
  return conflicts
}
