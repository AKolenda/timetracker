import assert from "node:assert/strict"
import test from "node:test"
import { reserveDraftEntries } from "./agent-draft-approvals.ts"
import type { TimeEntry } from "./types.ts"

const at = (minute: number) => new Date(minute * 60_000).toISOString()
function draft(start: number, end: number): Omit<TimeEntry, "id"> {
  return { projectId: "project", description: "Draft", startTime: at(start), endTime: at(end), duration: (end - start) * 60, billable: true, date: "1970-01-01" }
}

test("another draft can be reserved while the first save is pending", () => {
  const first = reserveDraftEntries([draft(0, 30)], [], [], 30)
  const second = reserveDraftEntries([draft(30, 60)], first, [], 30)
  assert.equal(first.length, 1)
  assert.equal(second.length, 1)
  assert.equal(second[0].duration, 1800)
  assert.deepEqual(reserveDraftEntries([draft(0, 30)], [...first, ...second], [], 30), [])
})

test("bulk approval excludes pending time and reserves overlapping requests only once", () => {
  const pending = reserveDraftEntries([draft(0, 30)], [], [])
  const bulk = reserveDraftEntries([draft(0, 60), draft(45, 90)], pending, [], 30)
  assert.deepEqual(bulk.map((entry) => [entry.startTime, entry.endTime]), [[at(30), at(60)], [at(60), at(90)]])
})

test("released failed reservations can be retried while saved time remains protected", () => {
  const [saved] = reserveDraftEntries([draft(0, 60)], [], [], 30)
  const retry = reserveDraftEntries([draft(0, 60)], [saved], [], 30)
  assert.deepEqual(retry.map((entry) => [entry.startTime, entry.endTime]), [[at(30), at(60)]])
})

test("reservations respect active timers and remain separate across projects", () => {
  const otherProject = { ...draft(0, 60), id: "other", projectId: "other" }
  const reserved = reserveDraftEntries([draft(0, 60)], [otherProject], [{ id: "timer", projectId: "project", startTime: at(45) }], 30)
  assert.deepEqual(reserved.map((entry) => entry.duration), [1800, 900])
})
