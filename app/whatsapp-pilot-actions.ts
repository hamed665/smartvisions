'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { whatsappPilotRequestKey } from '@/lib/whatsapp/pilot';
import {
  resolveControlledPilotGrowthOsBaseUrl,
  verifyControlledWhatsAppPilot,
} from '@/lib/outreach/controlled-whatsapp-pilot';
import { evaluateWhatsAppSendPolicy } from '@/lib/whatsapp/policy';
import { evaluateLocalWindow, type MarketCode } from '@/lib/outreach/scheduler';
import { assertPaidOperationAllowed, getCostGuardState } from '@/lib/reliability/cost-guard';

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

  // Use our durable database UUID, not Meta's provider_message_id. Meta IDs may contain
  // characters (for example '=') that the canonical Agent idempotency contract rejects.
  const requestKey = whatsappPilotRequestKey(inbound.id);
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

  const baseUrl = resolveControlledPilotGrowthOsBaseUrl({
    appBaseUrl: process.env.APP_BASE_URL,
    vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  });
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) throw new Error('INTERNAL_API_KEY is not configured');
  const endpoint = `${baseUrl}/api/ai/process-inbound`;

  const response = await fetch(endpoint, {
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
    throw new Error(typeof payload.error === 'string'
      ? payload.error
      : `Agent pilot failed with HTTP ${response.status} on Growth OS process-inbound`);
  }

  const approvalQueue = payload.approvalQueue as Record<string, unknown> | undefined;
  const { error: auditError } = await ctx.supabase.from('audit_logs').insert({
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
  if (auditError) throw new Error(`Pilot audit log failed: ${auditError.message}`);

  revalidatePath('/approvals');
  revalidatePath('/conversations');
}

export async function sendApprovedWhatsAppPilot(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const messageId = String(formData.get('id') ?? '').trim();
  if (!messageId) throw new Error('Approved pilot message id is required');

  const [{ data: controls, error: controlsError }, { data: message, error: messageError }] = await Promise.all([
    ctx.supabase
      .from('system_controls')
      .select('global_kill_switch,agents_paused,whatsapp_ai_paused,shadow_mode')
      .eq('organization_id', ctx.organizationId)
      .maybeSingle(),
    ctx.supabase
      .from('conversation_messages')
      .select('id,lead_id,conversation_id,channel,status,requires_approval,provider_message_id,metadata')
      .eq('organization_id', ctx.organizationId)
      .eq('id', messageId)
      .maybeSingle(),
  ]);

  if (controlsError || !controls) throw new Error(`Runtime controls unavailable: ${controlsError?.message ?? 'missing row'}`);
  if (messageError || !message) throw new Error(`Approved pilot message unavailable: ${messageError?.message ?? 'not found'}`);
  if (!controls.shadow_mode) throw new Error('Controlled pilot requires Shadow Mode to remain ON');
  if (controls.global_kill_switch) throw new Error('Global kill switch is ON');
  if (controls.agents_paused) throw new Error('Agents are paused');
  if (controls.whatsapp_ai_paused) throw new Error('WhatsApp AI is paused');
  if (!message.lead_id || !message.conversation_id) throw new Error('Approved pilot is missing durable lead/conversation linkage');

  const [{ data: lead, error: leadError }, { data: conversation, error: conversationError }] = await Promise.all([
    ctx.supabase
      .from('leads')
      .select('id,business_id,status,agent_mode')
      .eq('organization_id', ctx.organizationId)
      .eq('id', message.lead_id)
      .maybeSingle(),
    ctx.supabase
      .from('sales_conversations')
      .select('id,lead_id,channel')
      .eq('organization_id', ctx.organizationId)
      .eq('id', message.conversation_id)
      .maybeSingle(),
  ]);
  if (leadError || !lead?.business_id) throw new Error(`Pilot lead unavailable: ${leadError?.message ?? 'missing business'}`);
  if (conversationError || !conversation) throw new Error(`Pilot conversation unavailable: ${conversationError?.message ?? 'not found'}`);

  const [{ data: business, error: businessError }, { data: providerConnection, error: providerError }] = await Promise.all([
    ctx.supabase
      .from('businesses')
      .select('id,category,whatsapp,phone,country_code')
      .eq('organization_id', ctx.organizationId)
      .eq('id', lead.business_id)
      .maybeSingle(),
    ctx.supabase
      .from('integration_connections')
      .select('enabled,status,last_error')
      .eq('organization_id', ctx.organizationId)
      .eq('provider', 'META')
      .eq('channel', 'WHATSAPP')
      .maybeSingle(),
  ]);
  if (businessError || !business) throw new Error(`Pilot business unavailable: ${businessError?.message ?? 'not found'}`);
  if (providerError || !providerConnection?.enabled || providerConnection.status !== 'CONNECTED') {
    throw new Error(`WhatsApp provider is not production-verified CONNECTED: ${providerError?.message ?? providerConnection?.status ?? 'missing'}`);
  }

  const metadata = (message.metadata ?? {}) as Record<string, unknown>;
  const sendContext = (metadata.send_context ?? {}) as Record<string, unknown>;
  const verification = verifyControlledWhatsAppPilot({
    messageStatus: message.status,
    requiresApproval: Boolean(message.requires_approval),
    channel: message.channel,
    metadataSource: metadata.source,
    providerMessageId: message.provider_message_id,
    idempotencyKey: metadata.idempotency_key,
    catalogContentId: sendContext.catalog_content_id,
    sendTo: sendContext.to,
    messageLeadId: message.lead_id,
    conversationLeadId: conversation.lead_id,
    conversationChannel: conversation.channel,
    businessCategory: business.category,
    businessWhatsapp: business.whatsapp,
    businessPhone: business.phone,
  });
  if (!verification.verified) throw new Error(`Controlled pilot verification failed: ${verification.reason}`);

  const marketCode = String(sendContext.market_code ?? business.country_code ?? '').toUpperCase() as MarketCode;
  const leadTimezone = typeof sendContext.lead_timezone === 'string' ? sendContext.lead_timezone : undefined;
  const localWindow = evaluateLocalWindow({ marketCode, leadTimezone });
  if (!localWindow.allowed) throw new Error('Controlled pilot is outside the recipient local send window');

  const lastCustomerMessageAt = typeof sendContext.last_customer_message_at === 'string'
    ? sendContext.last_customer_message_at
    : undefined;
  const whatsappPolicy = evaluateWhatsAppSendPolicy({ lastCustomerMessageAt });
  if (!whatsappPolicy.allowed || whatsappPolicy.mode !== 'FREEFORM') {
    throw new Error('Controlled pilot requires a currently open WhatsApp 24-hour customer service window');
  }

  const costState = await getCostGuardState(ctx.organizationId);
  assertPaidOperationAllowed(costState, 'LOW');

  const baseUrl = resolveControlledPilotGrowthOsBaseUrl({
    appBaseUrl: process.env.APP_BASE_URL,
    vercelProjectProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  });
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) throw new Error('INTERNAL_API_KEY is not configured');

  const { error: auditError } = await ctx.supabase.from('audit_logs').insert({
    organization_id: ctx.organizationId,
    actor_type: 'USER',
    actor_id: ctx.userId,
    action: 'REQUEST_WHATSAPP_CONTROLLED_PILOT_SEND',
    entity_type: 'conversation_message',
    entity_id: message.id,
    after_data: {
      mode: verification.mode,
      catalog_content_id: verification.catalogContentId,
      recipient: verification.recipient,
      shadow_mode_remains_on: true,
      route: 'APPROVED_SEND',
    },
  });
  if (auditError) throw new Error(`Controlled send audit failed before provider call: ${auditError.message}`);

  const response = await fetch(`${baseUrl}/api/outreach/approved-send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-api-key': internalKey,
    },
    cache: 'no-store',
    body: JSON.stringify({
      organizationId: ctx.organizationId,
      messageId: message.id,
      priority: 'LOW',
      controlledShadowPilot: true,
    }),
  });

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok && response.status !== 202) {
    throw new Error(typeof payload.error === 'string'
      ? payload.error
      : `Controlled WhatsApp send failed with HTTP ${response.status}`);
  }

  revalidatePath('/approvals');
  revalidatePath('/conversations');
  revalidatePath('/costs');
}
