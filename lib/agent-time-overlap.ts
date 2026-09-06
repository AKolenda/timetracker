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

export type EntryOverlap = { reviewKey: string; overlapMilliseconds: number }

/** Measures the union of conflicting time so simultaneous overlaps count once. */
export function entryOverlapDetails(entries: TrackedRange[], timers: RunningRange[] = [], now = Date.now()): Map<string, EntryOverlap> {
  const reviews = new Map<string, EntryOverlap>()
  for (const entry of entries) {
    if (!entry.endTime) continue
    const start = Date.parse(entry.startTime)
    const end = Date.parse(entry.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    const conflicts = [
      ...entries.filter((other) => other.id !== entry.id && other.projectId === entry.projectId && other.endTime),
      ...timers.filter((timer) => timer.projectId === entry.projectId).map((timer) => ({ ...timer, endTime: null })),
    ].filter((other) => Math.min(other.endTime ? Date.parse(other.endTime) : now, end) - Math.max(Date.parse(other.startTime), start) > OVERLAP_WARNING_TOLERANCE_MS)
    const gaps = subtractRanges({ start, end }, conflicts.map((other) => ({ start: Date.parse(other.startTime), end: other.endTime ? Date.parse(other.endTime) : now })))
    const overlapMilliseconds = end - start - gaps.reduce((total, gap) => total + gap.end - gap.start, 0)
    const conflictKeys = conflicts.map((other) => [other.id, other.startTime, other.endTime]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    if (conflicts.length) reviews.set(entry.id, { reviewKey: JSON.stringify([entry.id, entry.projectId, entry.startTime, entry.endTime, conflictKeys]), overlapMilliseconds })
  }
  return reviews
}

/** Stable per-entry keys preserve dismissals when unrelated entries change. */
export function overlappingEntryReviewKeys(entries: TrackedRange[], timers: RunningRange[] = [], now = Date.now()): Map<string, string> {
  return new Map([...entryOverlapDetails(entries, timers, now)].map(([id, details]) => [id, details.reviewKey]))
}

export function overlappingEntryIds(entries: TrackedRange[], timers: RunningRange[] = [], now = Date.now()): Set<string> {
  return new Set(overlappingEntryReviewKeys(entries, timers, now).keys())
}
