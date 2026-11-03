import test from 'node:test'
import assert from 'node:assert/strict'
import { createSnapshotReads, createSummaryJobs, intervalIsSettled } from './summary-jobs.ts'

test('refreshes and concurrent tabs share a single pending title job',async()=>{
 const run=createSummaryJobs<string>()
 let calls=0
 let finish!: (value:string)=>void
 const work=()=>{calls++;return new Promise<string>(resolve=>{finish=resolve})}
 const first=run('same-interval',work)
 const second=run('same-interval',work)
 await Promise.resolve()
 assert.equal(calls,1)
 finish('Improve search')
 assert.deepEqual(await Promise.all([first,second]),['Improve search','Improve search'])
 assert.equal(await run('same-interval',work),'Improve search')
 assert.equal(calls,1)
 assert.equal(await run('next-interval',async()=> 'Refine navigation'),'Refine navigation')
})
test('failed jobs cannot hammer the provider on refresh',async()=>{
 const run=createSummaryJobs<string>()
 let calls=0
 const work=async()=>{calls++;throw new Error('Provider unavailable')}
 await assert.rejects(run('interval',work))
 await assert.rejects(run('interval',work))
 assert.equal(calls,1)
})
test('moving end times wait for settlement while completed windows are eligible',()=>{
 const now=1_000_000
 assert.equal(intervalIsSettled(now,now),false)
 assert.equal(intervalIsSettled(now-119_999,now),false)
 assert.equal(intervalIsSettled(now-120_000,now),true)
})
test('a chat read is shared only by intervals that ended before it began',async()=>{
 let clock=1_000
 const read=createSnapshotReads<string>(60_000,5_000,()=>clock)
 let calls=0
 const work=async()=>`read ${++calls}`
 assert.equal(await read('chat',900,work),'read 1')
 // An interval that ended before the read reuses it.
 assert.equal(await read('chat',1_000,work),'read 1')
 // One that ends after the read began needs messages written since, so it reads again.
 clock=2_000
 assert.equal(await read('chat',1_500,work),'read 2')
 assert.equal(calls,2)
})
test('a failed chat read is retried after a short wait',async()=>{
 let clock=0
 const read=createSnapshotReads<string>(60_000,5_000,()=>clock)
 let calls=0
 await assert.rejects(read('chat',0,async()=>{calls++;throw new Error('Collector timed out')}))
 await new Promise(resolve=>setTimeout(resolve,1))
 await assert.rejects(read('chat',0,async()=>{calls++;return 'too soon'}))
 clock=5_001
 assert.equal(await read('chat',0,async()=>{calls++;return 'messages'}),'messages')
 assert.equal(calls,2)
})
