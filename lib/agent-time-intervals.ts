/** Split elapsed time without rounding away the final remainder. */
export function splitAgentRange(range: { start: number; end: number }, maxMinutes?: number | null) {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) return []
  if (!maxMinutes || !Number.isFinite(maxMinutes) || maxMinutes < 1) return [{ ...range }]
  const width = Math.floor(maxMinutes) * 60_000
  const ranges = []
  for (let start = range.start; start < range.end; start += width) ranges.push({ start, end: Math.min(start + width, range.end) })
  return ranges
}
