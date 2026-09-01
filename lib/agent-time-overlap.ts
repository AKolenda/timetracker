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
