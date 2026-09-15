import assert from "node:assert/strict"
import test from "node:test"

import { agentTimeUrls, parseAgentTimeHosts, transcriptCollectors } from "./agent-time-hosts.ts"

test("reads multiple valid Agent Time hosts from persisted settings", () => {
  assert.deepEqual(
    parseAgentTimeHosts([
      " http://workstation.example:8080/api/data ",
      "http://coding-vm.example:8080/api/data",
      42,
      "",
    ]),
    [
      "http://workstation.example:8080/api/data",
      "http://coding-vm.example:8080/api/data",
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


test("does not connect to personal machines by default", () => {
  assert.deepEqual(agentTimeUrls(undefined, []), [])
})

test("chat requests cannot supply unconfigured collector addresses", () => {
  const host = "http://workstation.example/api/data"
  assert.deepEqual(transcriptCollectors(host, undefined, [host]), [host])
  assert.throws(() => transcriptCollectors("http://unconfigured.example/api/data", undefined, [host]), /no longer configured/)
})
