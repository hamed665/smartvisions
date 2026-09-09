import handler from 'vinext/server/fetch-handler';
import { POST as dailyAcquisitionPost } from '../app/api/operations/daily-acquisition/route';
import { POST as dailyEvidencePost } from '../app/api/operations/daily-evidence/route';
import { POST as controlledAutoDispatchPost } from '../app/api/operations/controlled-auto-dispatch/route';
import { POST as pilotAcquisitionPost } from '../app/api/operations/pilot-acquisition/route';
import { shouldRunScheduledOperations } from './schedule-policy';

type WorkerVersionMetadata = { id?: string; tag?: string; timestamp?: string };
type WorkerEnv = { INTERNAL_API_KEY?: string; DEPLOYMENT_ENV?: string; CF_VERSION_METADATA?: WorkerVersionMetadata };
type ScheduledController = { scheduledTime?: number; cron?: string };
type ExecutionContextLike = { waitUntil(promise: Promise<unknown>): void };
type AgentTask = { requestKey: string; channel: 'EMAIL' | 'WHATSAPP'; payload: Record<string, unknown> };
type TickResponse = { agentTasks?: AgentTask[] };
type ScheduledMetrics = {
  discovered:number; processed:number; safetyBlocked:number; idempotent:number; throttled:number; failed:number; reconciliationAttention:number; tickStatus:number;
  dailyAcquisitionStatus?:number; dailyAcquisitionAction?:string; dailyAcquisitionReason?:string; dailyAcquisitionMarket?:string;
  evidenceStatus?:number; evidenceFailedOutcomes?:number; evidenceAction?:string; evidenceReason?:string; evidenceFirstTouchStatus?:string; evidenceFirstTouchReason?:string; evidenceMarket?:string;
  autoDispatchStatus?:number; autoDispatchAction?:string; autoDispatchReason?:string; autoDispatchMarket?:string;
  pilotStatus?:number; pilotFailedOutcomes?:number;
  telegramDigestStatus?:number; telegramDigestAction?:string; telegramDigestReason?:string;
};

function organizationIdFromTask(task: AgentTask) {
  const context = task.payload.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const organizationId = (context as Record<string, unknown>).organizationId;
  return typeof organizationId === 'string' && organizationId.trim() ? organizationId.trim() : null;
}
function internalJsonRequest(env: WorkerEnv, path: string, body: unknown) {
  if (!env.INTERNAL_API_KEY) throw new Error('INTERNAL_API_KEY is required for scheduled operations');
  return new Request(`https://smartvisions.internal${path}`, { method:'POST', headers:{'content-type':'application/json','x-internal-api-key':env.INTERNAL_API_KEY}, body:JSON.stringify(body) });
}
async function internalPost(env: WorkerEnv, path: string, body: unknown) { return handler.fetch(internalJsonRequest(env,path,body)); }
async function recordScheduledHeartbeat(env: WorkerEnv, controller: ScheduledController|undefined, phase:'START'|'RESULT', metrics?:ScheduledMetrics) {
  const cron=typeof controller?.cron==='string'?controller.cron.trim():''; if(!cron)return;
  try { await internalPost(env,'/api/operations/heartbeat',{source:'CLOUDFLARE_CRON',phase,cron,scheduledTime:controller?.scheduledTime,workerVersion:env.CF_VERSION_METADATA??{},metrics}); } catch { /* observability never blocks work */ }
}
async function reportFailure(env:WorkerEnv,task:AgentTask,detail:string){
  const organizationId=organizationIdFromTask(task);if(!organizationId)return;
  try{await internalPost(env,'/api/operations/report',{organizationId,code:'AGENT_PROCESSING_FAILED',eventKey:`agent:${task.requestKey}:failed`,detail:detail.slice(0,1000),entityType:'agent_run',payload:{requestKey:task.requestKey,channel:task.channel}});}catch{/* reporting never retries paid work */}
}

export async function runScheduledOperations(env:WorkerEnv,controller?:ScheduledController){
  await recordScheduledHeartbeat(env,controller,'START');
  const tickResponse=await internalPost(env,'/api/operations/tick',{});
  const metrics:ScheduledMetrics={discovered:0,processed:0,safetyBlocked:0,idempotent:0,throttled:0,failed:0,reconciliationAttention:0,tickStatus:tickResponse.status};
  if(!tickResponse.ok){metrics.failed++;await recordScheduledHeartbeat(env,controller,'RESULT',metrics);throw new Error(`Operational tick failed with HTTP ${tickResponse.status}`);}
  const tick=await tickResponse.json() as TickResponse;const tasks=Array.isArray(tick.agentTasks)?tick.agentTasks.slice(0,5):[];metrics.discovered=tasks.length;
  for(const task of tasks){
    const organizationId=organizationIdFromTask(task);if(!organizationId){metrics.failed++;continue;}
    let guard:Response;try{guard=await internalPost(env,'/api/operations/channel-guard',{organizationId,channel:task.channel});}catch(error){metrics.failed++;await reportFailure(env,task,error instanceof Error?error.message:'Channel guard invocation failed');continue;}
    if(!guard.ok){if(guard.status>=500){metrics.failed++;await reportFailure(env,task,`Channel guard HTTP ${guard.status}: ${await guard.text().catch(()=> 'unavailable')}`);}else metrics.safetyBlocked++;continue;}
    let response:Response;try{response=await internalPost(env,'/api/ai/process-inbound',task.payload);}catch(error){metrics.failed++;await reportFailure(env,task,error instanceof Error?error.message:'Agent invocation failed');continue;}
    if(!response.ok){if(response.status===409)metrics.idempotent++;else if(response.status===423)metrics.safetyBlocked++;else if(response.status===429)metrics.throttled++;else{metrics.failed++;await reportFailure(env,task,`HTTP ${response.status}: ${await response.text().catch(()=> 'failed')}`);}continue;}
    metrics.processed++;
    if(task.channel==='EMAIL'){
      const reconciliation=await internalPost(env,'/api/operations/email-shadow',{organizationId,requestKey:task.requestKey});
      if(reconciliation.status===202||reconciliation.status>=500){metrics.reconciliationAttention++;try{await internalPost(env,'/api/operations/report',{organizationId,code:'RECONCILIATION_REQUIRED',eventKey:`email-shadow:${task.requestKey}:reconciliation`,detail:`Email Shadow reconciliation HTTP ${reconciliation.status}`.slice(0,1000),entityType:'agent_run',payload:{requestKey:task.requestKey}});}catch{/* no paid retry */}}
    }
  }

  // Canonical daily pipeline. Each stage is deterministic/fail-closed and advances at most
  // one paid qualification / one evidence candidate / one provider send per cron tick.
  try{
    const r=await dailyAcquisitionPost(internalJsonRequest(env,'/api/operations/daily-acquisition',{}));metrics.dailyAcquisitionStatus=r.status;
    if(r.status===429)metrics.throttled++;else if(r.status===409||r.status===423)metrics.safetyBlocked++;else if(!r.ok)metrics.failed++;
    const b=await r.json().catch(()=>null) as {action?:string;reason?:string;marketCode?:string}|null;metrics.dailyAcquisitionAction=b?.action;metrics.dailyAcquisitionReason=b?.reason;metrics.dailyAcquisitionMarket=b?.marketCode;
  }catch{metrics.failed++;}
  try{
    const r=await dailyEvidencePost(internalJsonRequest(env,'/api/operations/daily-evidence',{}));metrics.evidenceStatus=r.status;
    if(r.status===429)metrics.throttled++;else if(r.status===409||r.status===423)metrics.safetyBlocked++;else if(!r.ok)metrics.failed++;
    const b=await r.json().catch(()=>null) as {action?:string;reason?:string;marketCode?:string;firstTouch?:{status?:string;reason?:string}}|null;metrics.evidenceAction=b?.action;metrics.evidenceReason=b?.reason;metrics.evidenceMarket=b?.marketCode;metrics.evidenceFirstTouchStatus=b?.firstTouch?.status;metrics.evidenceFirstTouchReason=b?.firstTouch?.reason;metrics.evidenceFailedOutcomes=b?.action==='FAILED'?1:0;if(metrics.evidenceFailedOutcomes)metrics.failed++;
  }catch{metrics.failed++;}
  try{
    const r=await controlledAutoDispatchPost(internalJsonRequest(env,'/api/operations/controlled-auto-dispatch',{}));metrics.autoDispatchStatus=r.status;
    if(r.status===429)metrics.throttled++;else if(r.status===409||r.status===423)metrics.safetyBlocked++;else if(!r.ok)metrics.failed++;
    const b=await r.json().catch(()=>null) as {action?:string;reason?:string;marketCode?:string}|null;metrics.autoDispatchAction=b?.action;metrics.autoDispatchReason=b?.reason;metrics.autoDispatchMarket=b?.marketCode;
  }catch{metrics.failed++;}

  // Legacy Oman acquisition remains isolated for old pilot campaigns only. It does not own
  // Daily Outreach anymore and keeps its old tiny paid-call policy/recovery semantics.
  try{
    const r=await pilotAcquisitionPost(internalJsonRequest(env,'/api/operations/pilot-acquisition',{}));metrics.pilotStatus=r.status;
    if(r.status===429)metrics.throttled++;else if(r.status===409||r.status===423)metrics.safetyBlocked++;else if(!r.ok)metrics.failed++;else{const b=await r.json().catch(()=>null) as {outcomes?:Array<{action?:string}>}|null;const failed=(b?.outcomes??[]).filter(x=>x.action==='FAILED').length;metrics.pilotFailedOutcomes=failed;metrics.failed+=failed;}
  }catch{metrics.failed++;}

  try{
    const r=await internalPost(env,'/api/operations/telegram-daily-digest',{});metrics.telegramDigestStatus=r.status;if(!r.ok)metrics.failed++;else{const b=await r.json().catch(()=>null) as {action?:string;reason?:string}|null;metrics.telegramDigestAction=b?.action;metrics.telegramDigestReason=b?.reason;}
  }catch{metrics.failed++;}
  await recordScheduledHeartbeat(env,controller,'RESULT',metrics);return metrics;
}

const worker={fetch(request:Request){return handler.fetch(request);},scheduled(controller:ScheduledController,env:WorkerEnv,ctx:ExecutionContextLike){if(!shouldRunScheduledOperations(env))return;ctx.waitUntil(runScheduledOperations(env,controller));}};
export default worker;
