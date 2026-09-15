import { defaultSettings, type AppData } from './types'

/** Fictional data for reproducible README screenshots; enabled only in fixture builds. */
export function demoFixture(): AppData {
  const now = new Date()
  const iso = now.toISOString()
  const date = (day: number) => new Date(now.getFullYear(), now.getMonth(), day, 12).toISOString().slice(0, 10)
  const today = now.getDate()
  const clients: AppData['clients'] = ['Northstar Studio', 'Harbor Labs', 'Summit Design'].map((name, i) => ({id:`demo-client-${i}`,name,email:`hello@${['northstar','harbor','summit'][i]}.example`,phone:'',address:'',color:['#6366f1','#14b8a6','#f59e0b'][i],invoiceEmail:'',invoiceScheduleWeeks:2,invoiceScheduleAnchor:null,invoiceScheduleEnabled:false,invoiceScheduleAutoSend:false,lastInvoiceSent:null,createdAt:iso}))
  const projects: AppData['projects'] = ['Customer Portal', 'Analytics Platform', 'Website Refresh'].map((name,i)=>({id:`demo-project-${i}`,clientId:clients[i].id,name,rate:[100,120,95][i],currency:'USD',status:'active',color:clients[i].color,createdAt:iso}))
  const titles = ['Improve search keyboard navigation','Refine the results preview','Resolve dashboard loading states','Review mobile account settings','Add export progress feedback','Simplify project navigation']
  const timeEntries: AppData['timeEntries'] = Array.from({length:36},(_,i)=>{
    const day=Math.max(1,today-Math.floor(i/3));const start=new Date(now.getFullYear(),now.getMonth(),day,10+(i%3),0,0); const end=new Date(+start+1800000);const project=projects[i%3];const host=i%2?'http://vm.example:8080/api/data':'http://workstation.example:8080/api/data'
    return {id:`demo-entry-${i}`,projectId:project.id,description:titles[i%titles.length],startTime:start.toISOString(),endTime:end.toISOString(),duration:1800,billable:true,date:date(day),agentTimeSources:[{start:start.toISOString(),end:end.toISOString(),durationSeconds:1800,agent:i%2?'Claude':'Codex',source:'T3 Code',model:i%2?'Claude':'gpt-5.6-terra',conversationId:`fixture-demo-chat-${i}`,canonicalConversationId:`demo-chat-${i}`,conversationTitle:titles[i%titles.length],hostUrl:host,machineLabel:i%2?'Development VM':'Workstation'}]}
  })
  return {clients,projects,timeEntries,expenses:[{id:'demo-expense-1',projectId:projects[0].id,description:'Design assets',amount:48,category:'Software',date:date(today),notes:'',invoiced:false},{id:'demo-expense-2',projectId:projects[1].id,description:'Development hosting',amount:25,category:'Software',date:date(Math.max(1,today-2)),notes:'',invoiced:false}],invoices:[{id:'demo-invoice',invoiceNumber:'INV-1004',clientId:clients[0].id,status:'paid',issueDate:date(1),dueDate:date(15),subtotal:1500,tax:0,total:1500,notes:'',lineItems:[],createdAt:iso}],settings:{...defaultSettings,businessName:'Independent Studio',businessEmail:'hello@studio.example',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,agentTimeMaxMinutes:30,agentTimeHosts:['http://workstation.example:8080/api/data','http://vm.example:8080/api/data'],agentTimeHostLabels:{'http://workstation.example:8080/api/data':'Workstation','http://vm.example:8080/api/data':'Development VM'}},activeTimers:[{id:'demo-timer',projectId:projects[0].id,description:'Refine search and navigation',startTime:new Date(+now-17*60000-23000).toISOString(),billable:true}]}
}
