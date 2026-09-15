import assert from 'node:assert/strict'
import test from 'node:test'
import { splitAgentRange } from './agent-time-intervals.ts'
test('45 minutes produces a full interval and a 15 minute remainder', () => {
  assert.deepEqual(splitAgentRange({start: 0, end: 45*60000},30), [{start:0,end:1800000},{start:1800000,end:2700000}])
})
test('fractional timestamps preserve total billable seconds', () => {
  const input = {start: 291, end: 3600450}
  const parts = splitAgentRange(input,30)
  assert.equal(parts.reduce((n,p)=>n+Math.floor((p.end-p.start)/1000),0), Math.floor((input.end-input.start)/1000))
  assert.equal(parts.at(-1)?.end,input.end)
  assert.deepEqual(splitAgentRange(input,null),[input])
})
