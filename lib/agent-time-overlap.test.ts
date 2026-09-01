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
