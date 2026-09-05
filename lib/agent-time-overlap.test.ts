import assert from "node:assert/strict"
import test from "node:test"

import { subtractRanges } from "./agent-time-overlap.ts"

function minute(value: number) {
  return value * 60_000
}

test("imports only both uncovered edges around an existing tracked entry", () => {
  assert.deepEqual(
    subtractRanges(
      { start: minute(100), end: minute(215) },
      [{ start: minute(120), end: minute(180) }]
    ),
    [
      { start: minute(100), end: minute(120) },
      { start: minute(180), end: minute(215) },
    ]
  )
})

test("does not import a fully covered interval", () => {
  assert.deepEqual(
    subtractRanges(
      { start: minute(120), end: minute(180) },
      [{ start: minute(100), end: minute(215) }]
    ),
    []
  )
})

import { occupiedProjectRanges, overlappingEntryIds } from "./agent-time-overlap.ts"
const at = (minutes: number) => new Date(minutes * 60_000).toISOString()
const entry = (id: string, start: number, end: number | null, projectId = "a") => ({ id, projectId, startTime: at(start), endTime: end === null ? null : at(end) })

test("active timers reserve time from their start, including future agent time", () => {
  const ranges = occupiedProjectRanges("a", [entry("saved", 10, 20)], [{ id: "timer", projectId: "a", startTime: at(30) }])
  assert.deepEqual(subtractRanges({ start: minute(0), end: minute(60) }, ranges), [{ start: minute(0), end: minute(10) }, { start: minute(20), end: minute(30) }])
})

test("flags both overlapping entries but excludes adjacent, other-project, and hours-only entries", () => {
  const entries = [entry("one", 10, 30), entry("two", 20, 40), entry("adjacent", 40, 50), entry("other", 10, 40, "b"), entry("hours", 20, null)]
  assert.deepEqual([...overlappingEntryIds(entries)].sort(), ["one", "two"])
})

test("saved entries overlapping running timers are flagged", () => {
  assert.deepEqual([...overlappingEntryIds([entry("one", 10, 30)], [{ id: "timer", projectId: "a", startTime: at(20) }], minute(25))], ["one"])
})

test("overlapping occupied ranges are counted once and repeated imports have no uncovered time", () => {
  const source = { start: minute(0), end: minute(60) }
  const occupied = [{ start: minute(10), end: minute(30) }, { start: minute(20), end: minute(40) }]
  const first = subtractRanges(source, occupied)
  assert.deepEqual(first, [{ start: 0, end: minute(10) }, { start: minute(40), end: minute(60) }])
  assert.deepEqual(subtractRanges(source, [...occupied, ...first]), [])
})
