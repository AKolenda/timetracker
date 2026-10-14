import test from 'node:test'
import assert from 'node:assert/strict'
import { groupConversationSources, messagePlacement } from './agent-time-chats.ts'
const base = {start: new Date(0).toISOString(),end:new Date(60000).toISOString(),durationSeconds:60,agent:'Claude',model:'claude',source:'Claude',conversationId:'native-session',conversationTitle:'Same title',canonicalConversationId:'t3-thread',hostUrl:'https://machine.example'}
test('T3 and native session merge by provider link without counting time twice',()=>{
 const result=groupConversationSources([base,{...base,source:'T3 Code',conversationId:'t3-thread',end:new Date(90000).toISOString()}],0,100000)
 assert.equal(result.length,1)
 assert.equal(result[0].durationSeconds,90)
 assert.equal(result[0].conversationId,'t3-thread')
})
test('same title never merges unrelated chats or machines',()=>{
 assert.equal(groupConversationSources([base,{...base,canonicalConversationId:'other'},{...base,hostUrl:'https://other.example'}],0,100000).length,3)
})
test('messages are placed against the entry window, with open entries unbounded',()=>{
 const at=(ms:number)=>new Date(ms).toISOString()
 assert.equal(messagePlacement(at(999),1000,2000),'before')
 assert.equal(messagePlacement(at(1000),1000,2000),'inside')
 assert.equal(messagePlacement(at(2000),1000,2000),'inside')
 assert.equal(messagePlacement(at(2001),1000,2000),'after')
 assert.equal(messagePlacement(at(9e12),1000,NaN),'inside')
 assert.equal(messagePlacement(null,1000,2000),'unknown')
 assert.equal(messagePlacement('not a date',1000,2000),'unknown')
})
