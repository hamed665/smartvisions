import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
const mocks=vi.hoisted(() => ({createClient:vi.fn(), sync:vi.fn(), project:vi.fn(), run:vi.fn()}));
vi.mock('@supabase/supabase-js', () => ({createClient:mocks.createClient}));
vi.mock('@/lib/whatsapp/chatwoot-inbound-sync', () => ({processPendingWhatsAppChatwootSync:mocks.sync}));
vi.mock('@/lib/chatwoot/unified-inbox-reconciler', () => ({processPendingChatwootInboxEvents:mocks.project}));
vi.mock('@/lib/whatsapp/internal-test-live-reply', () => ({runInternalTestLiveReply:mocks.run}));
import {runSahraFastInbound} from '@/lib/whatsapp/sahra-fast-inbound';
import {SAHRA_FAST_SCOPE} from '@/lib/whatsapp/sahra-fast-inbound-core';
const now=Date.parse('2026-10-14T13:00:30Z');
function service(options:{paused?:boolean; rows?:boolean; claimed?:boolean}={}) {
 const candidate={id:'inbound', organization_id:SAHRA_FAST_SCOPE.organizationId,
  provider_message_id:'meta-inbound', received_at:new Date(now-225000).toISOString(),
  metadata:{conversation_id:'conversation',type:'text',
   tenant_business_id:SAHRA_FAST_SCOPE.tenantBusinessId,communication_channel_binding_id:SAHRA_FAST_SCOPE.bindingId}};
 const builders:Record<string,ReturnType<typeof builder>>={};
 function builder(table:string) {
  const data=table==='outreach_messages'?(options.rows===false?[]:[candidate])
    :table==='audit_logs'&&options.claimed?[{entity_id:candidate.id}]:[];
  const b={
   select:vi.fn(() => b), eq:vi.fn(() => b), gte:vi.fn(() => b), lte:vi.fn(() => b),
   order:vi.fn(() => b), in:vi.fn(() => b),
   limit:vi.fn(async () => ({data,error:null})),
   maybeSingle:vi.fn(async () => ({error:null,data:table==='approval_rules'
    ?{requires_approval:true,config:{permanentInboundReply:{enabled:true,inboundOnly:true,noUnsolicited:true,
      tenantBusinessId:SAHRA_FAST_SCOPE.tenantBusinessId,bindingId:SAHRA_FAST_SCOPE.bindingId}}}
    :table==='system_controls'?{shadow_mode:true,global_kill_switch:false,agents_paused:false,whatsapp_ai_paused:!!options.paused}
    :{id:'canonical-inbox'}})),
   insert:vi.fn(async () => ({data:null,error:null})),
   then:(resolve:(value:unknown)=>unknown) => Promise.resolve({data,error:null}).then(resolve),
  };
  return b;
 }
 const db={from:vi.fn((table:string) => builders[table]??=builder(table))};
 return {db,builders};
}
beforeEach(() => {
 vi.useFakeTimers();vi.setSystemTime(now);
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://ci.supabase.co');
 vi.stubEnv('SUPABASE_SECRET_KEY','ci-secret');
 for(const fn of Object.values(mocks)) fn.mockReset();
});
afterEach(() => {vi.useRealTimers();vi.unstubAllEnvs();});
describe('first customer preparation before canonical AI admission', () => {
 it('reconciles exact scoped inbound and signed projection before running AI', async () => {
  const {db,builders}=service();mocks.createClient.mockReturnValue(db);
  const order:string[]=[];
  mocks.sync.mockImplementation(async () => {order.push('sync');});
  mocks.project.mockImplementation(async () => {order.push('projection');});
  mocks.run.mockImplementation(async () => {order.push('ai');return {attempted:true,sent:true,reason:'SENT'};});
  const metrics=await runSahraFastInbound({DEPLOYMENT_ENV:'production',INTERNAL_API_KEY:'ci'},now-30000);
  expect(order.slice(0,3)).toEqual(['sync','projection','ai']);
  expect(metrics?.sent).toBe(1);expect(mocks.run).toHaveBeenCalledTimes(1);
  expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({
   organizationId:SAHRA_FAST_SCOPE.organizationId,bindingId:SAHRA_FAST_SCOPE.bindingId,
   inboundOnly:true,limit:2,receivedAfter:new Date(now-300000).toISOString(),
  }));
  expect(mocks.project).toHaveBeenCalledWith(expect.objectContaining({scope:{
   organizationId:SAHRA_FAST_SCOPE.organizationId,tenantBusinessId:SAHRA_FAST_SCOPE.tenantBusinessId,
   inboxMappingId:'canonical-inbox',receivedAfter:new Date(now-300000).toISOString(),
  }}));
  expect(builders.outreach_messages.gte).toHaveBeenCalledWith('received_at',new Date(now-300000).toISOString());
 });
 it('performs no preparation or AI while the owner pause is active', async () => {
  const {db}=service({paused:true});mocks.createClient.mockReturnValue(db);
  await runSahraFastInbound({DEPLOYMENT_ENV:'production',INTERNAL_API_KEY:'ci'},now-30000);
  expect(mocks.sync).not.toHaveBeenCalled();expect(mocks.project).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('does not touch historical journals when no fresh inbound exists', async () => {
  const {db}=service({rows:false});mocks.createClient.mockReturnValue(db);
  await runSahraFastInbound({DEPLOYMENT_ENV:'production',INTERNAL_API_KEY:'ci'},now-30000);
  expect(mocks.sync).not.toHaveBeenCalled();expect(mocks.project).not.toHaveBeenCalled();expect(mocks.run).not.toHaveBeenCalled();
 });
 it('does not replay an existing durable inbound claim', async () => {
  const {db}=service({claimed:true});mocks.createClient.mockReturnValue(db);
  await runSahraFastInbound({DEPLOYMENT_ENV:'production',INTERNAL_API_KEY:'ci'},now-30000);
  expect(mocks.run).not.toHaveBeenCalled();
 });
});
