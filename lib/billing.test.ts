import assert from "node:assert/strict"
import test from "node:test"
import { conversationKey } from "./agent-time-chats.ts"
import { billedSeconds, formatBillFactor, normalizeBillFactor, sourcesBillFactor } from "./billing.ts"

const at = (minutes: number) => new Date(minutes * 60_000).toISOString()
const source = (conversationId: string, start: number, end: number) => ({
  start: at(start), end: at(end), durationSeconds: (end - start) * 60, agent: "Claude", source: "Claude", model: "claude",
  conversationId, conversationTitle: conversationId, hostUrl: "https://machine.example",
})

test("an interval from one discounted chat bills at that chat's factor", () => {
  const sources = [source("long-run", 0, 30)]
  const factors = { [conversationKey(sources[0])]: 0.5 }
  assert.equal(sourcesBillFactor(sources, 0, 30 * 60_000, factors), 0.5)
  assert.equal(sourcesBillFactor(sources, 0, 30 * 60_000), 1)
})

test("parallel chats are weighted by their active time in the interval", () => {
  const sources = [source("discounted", 0, 30), source("full", 0, 10)]
  const factors = { [conversationKey(sources[0])]: 0.5 }
  assert.equal(sourcesBillFactor(sources, 0, 30 * 60_000, factors), normalizeBillFactor((30 * 0.5 + 10) / 40))
})

test("billed time and labels follow the stored factor", () => {
  assert.equal(billedSeconds({ duration: 1800, billFactor: 0.5 }), 900)
  assert.equal(billedSeconds({ duration: 1800 }), 1800)
  assert.equal(normalizeBillFactor(2), 1)
  assert.equal(normalizeBillFactor("x"), 1)
  assert.equal(formatBillFactor(normalizeBillFactor(1 / 3)), "⅓")
  assert.equal(formatBillFactor(0.25), "25%")
})
