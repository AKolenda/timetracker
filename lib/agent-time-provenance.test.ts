import assert from "node:assert/strict"
import test from "node:test"
import { clipAgentSources } from "./agent-time-provenance.ts"
import { machineName, parseAgentTimeHostLabels } from "./agent-time-hosts.ts"

const base = { start: "2026-01-01T10:00:00Z", end: "2026-01-01T11:00:00Z", durationSeconds: 3600, agent: "Codex", source: "T3 Code", model: "model", conversationId: "chat-123", conversationTitle: "Improve search", hostUrl: "http://workstation.example/api/data", machineLabel: "Workstation" }
test("approval clips chat activity and retains source machine and identity", () => {
  const saved = JSON.parse(JSON.stringify(clipAgentSources([base], Date.parse("2026-01-01T10:30:00Z"), Date.parse("2026-01-01T10:45:00Z"))))
  assert.equal(saved[0].durationSeconds, 900)
  assert.equal(saved[0].hostUrl, base.hostUrl)
  assert.equal(saved[0].conversationId, base.conversationId)
  assert.equal(saved[0].start, "2026-01-01T10:30:00.000Z")
  assert.deepEqual(clipAgentSources([base], Date.parse(base.end), Date.parse(base.end) + 5000), [])
})
test("machine labels remain editable after approval and fall back to hostname", () => {
  assert.equal(machineName(base, { [base.hostUrl]: "Office PC" }), "Office PC")
  assert.equal(machineName({ hostUrl: base.hostUrl }), "workstation.example")
  assert.deepEqual(parseAgentTimeHostLabels({ [base.hostUrl]: "  Office PC  ", bad: 3 }), { [base.hostUrl]: "Office PC" })
})
