import test from 'node:test'
import assert from 'node:assert/strict'
import { createSummaryJobs, intervalIsSettled } from './summary-jobs.ts'

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
