import assert from "node:assert/strict"
import test from "node:test"

import { agentTimeUrls, parseAgentTimeHosts } from "./agent-time-hosts.ts"

test("reads multiple valid Agent Time hosts from persisted settings", () => {
  assert.deepEqual(
    parseAgentTimeHosts([
      " http://10.40.40.10:8080/api/data ",
      "http://10.40.40.11:8080/api/data",
      42,
      "",
    ]),
    [
      "http://10.40.40.10:8080/api/data",
      "http://10.40.40.11:8080/api/data",
    ]
  )
})

test("includes unique Agent Time hosts configured in Settings", () => {
  assert.deepEqual(
    agentTimeUrls("http://agent-one/api/data", [
      " http://agent-two/api/data ",
      "http://agent-one/api/data",
      "",
    ]),
    ["http://agent-one/api/data", "http://agent-two/api/data"]
  )
})
