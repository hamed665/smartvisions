'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';

function normalizePhone(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '');
}

export async function processLatestWhatsAppInboundPilot() {
  const ctx = await getCurrentOrganization(true);

  const { data: controls, error: controlsError } = await ctx.supabase
    .from('system_controls')
    .select('global_kill_switch,agents_paused,whatsapp_ai_paused,shadow_mode')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (controlsError) throw new Error(`Runtime controls lookup failed: ${controlsError.message}`);
  if (!controls) throw new Error('Runtime controls are not configured');
  if (controls.global_kill_switch) throw new Error('Global kill switch is ON');
  if (controls.agents_paused) throw new Error('Agents are paused');
  if (controls.whatsapp_ai_paused) throw new Error('WhatsApp AI is paused');
  if (!controls.shadow_mode) throw new Error('Controlled pilot requires Shadow Mode to remain ON');

  const { data: inbound, error: inboundError } = await ctx.supabase
    .from('outreach_messages')
    .select('id,lead_id,body,provider_message_id,received_at,metadata')
    .eq('organization_id', ctx.organizationId)
    .eq('channel', 'WHATSAPP')
    .eq('direction', 'INBOUND')
    .not('lead_id', 'is', null)
    .not('received_at', 'is', null)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inboundError) throw new Error(`Latest WhatsApp inbound lookup failed: ${inboundError.message}`);
  if (!inbound?.lead_id || !inbound.body) throw new Error('No linked real WhatsApp inbound is ready for the pilot');

  const conversationId = typeof inbound.metadata?.conversation_id === 'string'
    ? inbound.metadata.conversation_id
    : '';
  if (!conversationId) throw new Error('Latest linked inbound has no durable conversation_id');

  const requestKey = `whatsapp-pilot:${inbound.provider_message_id || inbound.id}`;
  const { data: existingRun, error: existingRunError } = await ctx.supabase
    .from('agent_runs')
    .select('id,status')
    .eq('organization_id', ctx.organizationId)
    .eq('request_key', requestKey)
    .maybeSingle();
  if (existingRunError) throw new Error(`Pilot replay lookup failed: ${existingRunError.message}`);

  const { data: lead, error: leadError } = await ctx.supabase
    .from('leads')
    .select('id,business_id,agent_mode,intent_score,opportunity_score')
    .eq('organization_id', ctx.organizationId)
    .eq('id', inbound.lead_id)
    .single();
  if (leadError) throw new Error(`Pilot lead lookup failed: ${leadError.message}`);

  const { data: business, error: businessError } = await ctx.supabase
    .from('businesses')
    .select('id,name,country_code,category,whatsapp,phone')
    .eq('organization_id', ctx.organizationId)
    .eq('id', lead.business_id)
    .single();
  if (businessError) throw new Error(`Pilot business lookup failed: ${businessError.message}`);
  if (business.category !== 'INTERNAL_TEST') {
    throw new Error('Controlled pilot is restricted to an INTERNAL_TEST business');
  }

  const to = normalizePhone(business.whatsapp || business.phone);
  if (to.length < 8) throw new Error('Pilot recipient phone is not valid');

  const { data: conversation, error: conversationError } = await ctx.supabase
    .from('sales_conversations')
    .select('id,lead_id,channel,summary,detected_language,detected_dialect')
    .eq('organization_id', ctx.organizationId)
    .eq('id', conversationId)
    .single();
  if (conversationError) throw new Error(`Pilot conversation lookup failed: ${conversationError.message}`);
  if (conversation.channel !== 'WHATSAPP' || conversation.lead_id !== inbound.lead_id) {
    throw new Error('Pilot conversation linkage is inconsistent');
  }

  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) throw new Error('INTERNAL_API_KEY is not configured');
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://smartvisions.vercel.app';

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/ai/process-inbound`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-api-key': internalKey,
    },
    cache: 'no-store',
    body: JSON.stringify({
      idempotencyKey: requestKey,
      context: {
        organizationId: ctx.organizationId,
        leadId: inbound.lead_id,
        businessName: business.name,
        countryCode: business.country_code || 'OM',
        language: conversation.detected_language || undefined,
        industry: business.category || undefined,
        message: inbound.body,
        conversationSummary: conversation.summary || undefined,
        intentScore: lead.intent_score ?? undefined,
        opportunityScore: lead.opportunity_score ?? undefined,
        agentMode: lead.agent_mode || undefined,
      },
      deliveryContext: {
        conversationId,
        to,
        marketCode: business.country_code || 'OM',
        leadTimezone: business.country_code === 'OM' ? 'Asia/Muscat' : undefined,
      },
    }),
  });

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok && response.status !== 202) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `Agent pilot failed with HTTP ${response.status}`);
  }

  const approvalQueue = payload.approvalQueue as Record<string, unknown> | undefined;
  await ctx.supabase.from('audit_logs').insert({
    organization_id: ctx.organizationId,
    actor_type: 'USER',
    actor_id: ctx.userId,
    action: 'RUN_WHATSAPP_CONTROLLED_AGENT_PILOT',
    entity_type: 'outreach_message',
    entity_id: inbound.id,
    after_data: {
      request_key: requestKey,
      agent_run_id: payload.runId ?? existingRun?.id ?? null,
      replayed: payload.replayed ?? Boolean(existingRun),
      approval_queued: approvalQueue?.queued ?? null,
      catalog_content_id: (payload.trace as Record<string, unknown> | undefined)?.catalogRecommendation
        ? ((payload.trace as Record<string, unknown>).catalogRecommendation as Record<string, unknown>).contentId ?? null
        : null,
    },
  });

  revalidatePath('/approvals');
  revalidatePath('/conversations');
}
