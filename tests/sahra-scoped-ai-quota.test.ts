import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { stableAgentRequestKey } from '@/lib/operations/executor-core';
import { verifySahraInboundLifetimeQuotaExemption } from '@/lib/whatsapp/sahra-scoped-ai-quota';
import { SAHRA_FAST_SCOPE } from '@/lib/whatsapp/sahra-fast-inbound-core';
import { evaluateAiRunQuota } from '@/lib/reliability/cost-guard';

const providerMessageId = 'wamid.verified.customer.inbound';
const leadId = '03b912cc-630c-40a7-a881-f4f47ff1f723';
const conversationId = '98cf12c0-9d20-4214-b07e-22850f3f9d6b';
const inboundId = 'aba34a53-f32b-4b58-b020-481c938c043c';
function fixtures(override: {
  receipt?: boolean;
  binding?: string;
  source?: string;
  canonical?: boolean;
} = {}) {
  const queries: string[] = [];
  const rpc = vi.fn().mockResolvedValue({
    data: { allowed: override.receipt !== false, reason: 'VERIFIED' }, error: null,
  });
  const from = vi.fn((table: string) => {
    queries.push(table);
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => table === 'outreach_messages'
        ? { error: null, data: {
          id: inboundId,lead_id: leadId,
          metadata: {
            conversation_id: conversationId,
            tenant_business_id: SAHRA_FAST_SCOPE.tenantBusinessId,
            communication_channel_binding_id: override.binding ?? SAHRA_FAST_SCOPE.bindingId,
          },
        } }
        : { error:null, data: override.canonical === false ? null : {
          id:'canonical',lead_id:leadId,conversation_id:conversationId,
          metadata:{
            from: override.source ?? '96891234567',
            tenant_business_id: SAHRA_FAST_SCOPE.tenantBusinessId,
            communication_channel_binding_id: SAHRA_FAST_SCOPE.bindingId,
          },
        } }),
    };
    return chain;
  });
  const supabase = { from, rpc } as unknown as SupabaseClient;
  return { supabase, rpc, from, queries };
}
function args(supabase: SupabaseClient) {
  return {
    supabase,
    organizationId: SAHRA_FAST_SCOPE.organizationId,
    leadId,conversationId,
    expectedInboundProviderMessageId:providerMessageId,
    requestKey:stableAgentRequestKey('WHATSAPP',providerMessageId),
  };
}
describe('Sahra lifetime quota requires exact claimed customer Meta source', () => {
  it('allows only verified owner-claimed evidence and does not create another claim or provider send',async()=>{
    const {supabase,rpc,from}=fixtures();
    expect(await verifySahraInboundLifetimeQuotaExemption(args(supabase))).toBe(true);
    expect(from).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('verify_or_claim_whatsapp_controlled_inbound',{
      p_organization_id:SAHRA_FAST_SCOPE.organizationId,
      p_inbound_id:inboundId,
      p_recipient:'96891234567',
      p_claim:false,
      p_conversation_id:conversationId,
    });
  });
  it('rejects non-Sahra tenants, unrelated idempotency keys and missing source identity before querying', async()=>{
    const {supabase,from,rpc}=fixtures();
    for(const override of [
      {organizationId:'other-org'},
      {leadId:null},
      {conversationId:null},
      {expectedInboundProviderMessageId:null},
      {requestKey:'different-customer-request'},
    ]){
      expect(await verifySahraInboundLifetimeQuotaExemption({...args(supabase),...override})).toBe(false);
    }
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects wrong business/channel binding, missing canonical customer message, invalid sender and absent signed claim',async()=>{
    for (const input of [
      {binding:'other-binding'},
      {canonical:false},
      {source:'missing'},
      {receipt:false},
    ]){
      const {supabase}=fixtures(input);
      expect(await verifySahraInboundLifetimeQuotaExemption(args(supabase))).toBe(false);
    }
  });
  it('keeps FULL reasoning daily-deep quota enforced even with valid claimed Meta evidence',()=>{
    const settings={max_ai_runs_per_lead:20,daily_deep_ai_runs:10};
    const legacy = evaluateAiRunQuota({reasoningTier:'FULL',leadRunCount:20,dailyDeepRunCount:10,settings});
    expect(legacy).toMatchObject({allowed:false,reason:'MAX_AI_RUNS_PER_LEAD'});
    const scoped = evaluateAiRunQuota({reasoningTier:'FULL',leadRunCount:null,dailyDeepRunCount:10,settings});
    expect(scoped).toMatchObject({allowed:false,reason:'DAILY_DEEP_AI_RUNS'});
    expect(evaluateAiRunQuota({
      reasoningTier:'LIGHT',leadRunCount:null,dailyDeepRunCount:10,settings,
    })).toMatchObject({allowed:true});
  });
});
