'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { MetaCloudWhatsAppProvider } from '@/lib/whatsapp/meta-cloud';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { assertPaidOperationAllowed, getCostGuardState, recordUsage } from '@/lib/reliability/cost-guard';
import { verifyControlledWhatsAppVoicePilot } from '@/lib/voice/controlled-pilot';
import { transcribeWhatsAppVoiceOnce } from '@/lib/voice/transcription';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for WhatsApp verification');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizeRecipient(value: FormDataEntryValue | null) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) throw new Error('A valid WhatsApp test number is required');
  return digits;
}

function whatsappCredentialsReady() {
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN?.trim()
    || process.env.META_WHATSAPP_TOKEN?.trim()
    || process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim()
    || process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  return Boolean(token && phoneNumberId);
}

function safeMessage(value: unknown, fallback = 'WhatsApp verification failed') {
  return (value instanceof Error ? value.message : fallback)
    .replace(/https?:\/\/[^\s]+/g, '[url]')
    .slice(0, 220);
}

function recordValue(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export async function verifyWhatsAppIntegration(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const db = serviceClient();
  let destination = '/integrations';
  const startedAt = Date.now();

  const { data: currentIntegration } = await db
    .from('integration_connections')
    .select('status,enabled')
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'META')
    .eq('channel', 'WHATSAPP')
    .maybeSingle();
  const preservedEnabled = currentIntegration?.enabled === true;

  try {
    const recipient = normalizeRecipient(formData.get('test_whatsapp'));
    if (!whatsappCredentialsReady()) throw new Error('Meta WhatsApp credentials are not fully configured');

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: inbound, error: inboundError } = await db
      .from('whatsapp_events')
      .select('id,created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('direction', 'INBOUND')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1);
    if (inboundError) throw inboundError;
    if (!inbound?.length) throw new Error('No successful inbound WhatsApp webhook was recorded in the last 24 hours');

    const costState = await getCostGuardState(ctx.organizationId);
    assertPaidOperationAllowed(costState, 'NORMAL');

    const result = await new MetaCloudWhatsAppProvider().sendText({
      to: recipient,
      text: 'Smart Visions WhatsApp production verification. This is a controlled test reply; no action is required.',
    });

    await recordUsage({
      organizationId: ctx.organizationId,
      provider: 'WHATSAPP',
      operation: 'WHATSAPP_PROVIDER_VERIFICATION',
      costUsd: 0,
      units: 1,
      metadata: {
        source: 'OWNER_CONTROLLED_INTEGRATION_VERIFICATION',
        pricing_status: 'PENDING_RECONCILIATION',
        provider_message_id: result.providerMessageId,
      },
    });

    const checkedAt = new Date().toISOString();
    const latencyMs = Date.now() - startedAt;
    const { error: integrationError } = await db.from('integration_connections').update({
      status: 'CONNECTED',
      enabled: preservedEnabled,
      last_checked_at: checkedAt,
      last_error: null,
      updated_at: checkedAt,
    }).eq('organization_id', ctx.organizationId).eq('provider', 'META').eq('channel', 'WHATSAPP');
    if (integrationError) throw integrationError;

    const { error: auditError } = await db.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'META_WHATSAPP_CONTROLLED_VERIFICATION_SENT',
      entity_type: 'integration',
      entity_id: ctx.organizationId,
      after_data: {
        provider: 'META',
        channel: 'WHATSAPP',
        providerMessageId: result.providerMessageId,
        latencyMs,
        providerCalls: 1,
        inboundWebhookConfirmed: true,
        usageRecorded: true,
        outreachTriggered: false,
        integrationEnabled: preservedEnabled,
      },
    });
    if (auditError) throw auditError;

    destination = `/integrations?whatsapp=sent&latencyMs=${latencyMs}`;
  } catch (error) {
    const message = safeMessage(error);
    const checkedAt = new Date().toISOString();
    await db.from('integration_connections').update({
      status: currentIntegration?.status === 'CONNECTED' ? 'CONNECTED' : 'ERROR',
      enabled: preservedEnabled,
      last_checked_at: checkedAt,
      last_error: message,
      updated_at: checkedAt,
    }).eq('organization_id', ctx.organizationId).eq('provider', 'META').eq('channel', 'WHATSAPP');
    await db.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'META_WHATSAPP_CONTROLLED_VERIFICATION_FAILED',
      entity_type: 'integration',
      entity_id: ctx.organizationId,
      after_data: { provider: 'META', channel: 'WHATSAPP', error: message, outreachTriggered: false },
    });
    destination = `/integrations?whatsapp=error&message=${encodeURIComponent(message)}`;
  }

  revalidatePath('/integrations');
  redirect(destination);
}

export async function transcribeLatestWhatsAppVoicePilot() {
  const ctx = await getCurrentOrganization(true);
  const db = serviceClient();
  let destination = '/integrations';
  let sourceMessageId: string | null = null;

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [
      controlsResult,
      integrationsResult,
      businessesResult,
      inboundResult,
    ] = await Promise.all([
      db.from('system_controls')
        .select('shadow_mode,global_kill_switch,agents_paused,whatsapp_ai_paused')
        .eq('organization_id', ctx.organizationId)
        .maybeSingle(),
      db.from('integration_connections')
        .select('provider,channel,status,enabled')
        .eq('organization_id', ctx.organizationId)
        .in('provider', ['META', 'OPENAI']),
      db.from('businesses')
        .select('id,category,leads(id,agent_mode)')
        .eq('organization_id', ctx.organizationId)
        .eq('category', 'INTERNAL_TEST')
        .not('whatsapp', 'is', null)
        .limit(2),
      db.from('outreach_messages')
        .select('id,lead_id,provider_message_id,received_at,metadata')
        .eq('organization_id', ctx.organizationId)
        .eq('channel', 'WHATSAPP')
        .eq('direction', 'INBOUND')
        .not('lead_id', 'is', null)
        .not('received_at', 'is', null)
        .gte('received_at', since)
        .order('received_at', { ascending: false })
        .limit(50),
    ]);

    if (controlsResult.error) throw controlsResult.error;
    if (integrationsResult.error) throw integrationsResult.error;
    if (businessesResult.error) throw businessesResult.error;
    if (inboundResult.error) throw inboundResult.error;

    if (!businessesResult.data || businessesResult.data.length !== 1) {
      throw new Error('Controlled voice pilot requires exactly one INTERNAL_TEST WhatsApp business');
    }
    const pilotBusiness = businessesResult.data[0];
    const pilotLeads = Array.isArray(pilotBusiness.leads) ? pilotBusiness.leads : [];
    if (pilotLeads.length !== 1) throw new Error('Controlled voice pilot requires exactly one INTERNAL_TEST WhatsApp lead');
    const pilotLead = pilotLeads[0] as { id: string; agent_mode: string };

    const voiceInbound = (inboundResult.data ?? []).find((row) => {
      const metadata = recordValue(row.metadata);
      return row.lead_id === pilotLead.id
        && metadata.voice === true
        && typeof metadata.media_id === 'string'
        && Boolean(metadata.media_id)
        && typeof metadata.conversation_id === 'string'
        && Boolean(metadata.conversation_id)
        && typeof row.provider_message_id === 'string'
        && Boolean(row.provider_message_id);
    });
    if (!voiceInbound) throw new Error('No real linked INTERNAL_TEST WhatsApp voice was received in the last 24 hours');
    sourceMessageId = String(voiceInbound.id);

    const metadata = recordValue(voiceInbound.metadata);
    const conversationId = String(metadata.conversation_id);
    const mediaId = String(metadata.media_id);
    const mimeType = typeof metadata.mime_type === 'string' ? metadata.mime_type : undefined;
    const providerMessageId = String(voiceInbound.provider_message_id);

    const { data: conversation, error: conversationError } = await db
      .from('sales_conversations')
      .select('id,lead_id,channel,agent_mode')
      .eq('organization_id', ctx.organizationId)
      .eq('id', conversationId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) throw new Error('Linked WhatsApp voice conversation was not found');

    const whatsapp = (integrationsResult.data ?? []).find((row) => row.provider === 'META' && row.channel === 'WHATSAPP');
    const openai = (integrationsResult.data ?? []).find((row) => row.provider === 'OPENAI' && row.channel === 'AI');
    const controls = controlsResult.data;
    const verification = verifyControlledWhatsAppVoicePilot({
      shadowMode: controls?.shadow_mode === true,
      globalKillSwitch: controls?.global_kill_switch === true,
      agentsPaused: controls?.agents_paused === true,
      whatsappAiPaused: controls?.whatsapp_ai_paused === true,
      whatsappConnected: whatsapp?.status === 'CONNECTED',
      whatsappEnabled: whatsapp?.enabled === true,
      openAiConnected: openai?.status === 'CONNECTED',
      openAiEnabled: openai?.enabled === true,
      businessCategory: String(pilotBusiness.category ?? ''),
      messageLeadId: String(voiceInbound.lead_id ?? ''),
      conversationLeadId: String(conversation.lead_id ?? ''),
      conversationChannel: String(conversation.channel ?? ''),
      leadAgentMode: String(pilotLead.agent_mode ?? ''),
      conversationAgentMode: String(conversation.agent_mode ?? ''),
      voice: metadata.voice === true,
      providerMessageId,
      mediaId,
      conversationId,
    });
    if (!verification.verified) throw new Error(`Controlled voice pilot blocked: ${verification.reason}`);

    const result = await transcribeWhatsAppVoiceOnce({
      organizationId: ctx.organizationId,
      providerMessageId,
      mediaId,
      mimeType,
      leadId: pilotLead.id,
      conversationId,
      priority: 'NORMAL',
    });

    const { error: auditError } = await db.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'META_WHATSAPP_CONTROLLED_VOICE_TRANSCRIPTION',
      entity_type: 'outreach_message',
      entity_id: sourceMessageId,
      after_data: {
        provider: 'META',
        channel: 'WHATSAPP',
        sourceOutreachMessageId: sourceMessageId,
        providerMessageId,
        mediaId,
        transcriptionId: result.id,
        status: result.status,
        cached: result.cached,
        detectedLanguage: result.detectedLanguage ?? null,
        estimatedCostUsd: result.estimatedCostUsd,
        openAiCalls: result.cached ? 0 : 1,
        outboundTriggered: false,
        shadowModePreserved: true,
      },
    });
    if (auditError) throw auditError;

    destination = `/integrations?voice=${result.cached ? 'cached' : 'transcribed'}&voiceStatus=${encodeURIComponent(result.status)}`;
  } catch (error) {
    const message = safeMessage(error, 'Controlled WhatsApp voice transcription failed');
    await db.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'META_WHATSAPP_CONTROLLED_VOICE_TRANSCRIPTION_FAILED',
      entity_type: sourceMessageId ? 'outreach_message' : 'integration',
      entity_id: sourceMessageId ?? ctx.organizationId,
      after_data: {
        provider: 'META',
        channel: 'WHATSAPP',
        sourceOutreachMessageId: sourceMessageId,
        error: message,
        outboundTriggered: false,
      },
    });
    destination = `/integrations?voice=error&message=${encodeURIComponent(message)}`;
  }

  revalidatePath('/integrations');
  revalidatePath('/conversations');
  revalidatePath('/cost-usage');
  redirect(destination);
}
