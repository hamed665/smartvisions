'use server';

import { revalidatePath } from 'next/cache';
import { POST as approvedSendPost } from '@/app/api/outreach/approved-send/route';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { queueShadowDraft } from '@/lib/outreach/shadow-approval';
import {
  WHATSAPP_MARKETING_OPT_IN_FIELD,
  WHATSAPP_MARKETING_OPT_OUT_FIELD,
  WHATSAPP_OPT_IN_SOURCE_TYPES,
  normalizeWhatsAppRecipient,
  type WhatsAppOptInSourceType,
} from '@/lib/whatsapp/marketing-opt-in';
import { buildSmartVisionsBusinessIntroOm } from '@/lib/whatsapp/business-intro-template';

function required(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function internalJsonRequest(path: string, internalKey: string, body: unknown) {
  return new Request(`https://growth-os.internal${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-api-key': internalKey,
    },
    body: JSON.stringify(body),
  });
}

async function loadCanonicalLead(leadId: string) {
  const ctx = await getCurrentOrganization(true);
  const { data: lead, error: leadError } = await ctx.supabase
    .from('leads')
    .select('id,business_id,status,agent_mode,businesses(id,name,country_code,whatsapp,international_phone,phone)')
    .eq('organization_id', ctx.organizationId)
    .eq('id', leadId)
    .maybeSingle();
  if (leadError || !lead?.business_id) {
    throw new Error(`Lead unavailable: ${leadError?.message ?? 'missing business'}`);
  }
  const business = Array.isArray(lead.businesses) ? lead.businesses[0] : lead.businesses;
  if (!business) throw new Error('Canonical business is unavailable');
  if (String(business.country_code ?? '').toUpperCase() !== 'OM') {
    throw new Error('WhatsApp opt-in pilot is restricted to Oman');
  }
  const recipient = normalizeWhatsAppRecipient(
    business.whatsapp || business.international_phone || business.phone,
  );
  if (recipient.length < 8) throw new Error('Canonical WhatsApp recipient is unavailable');
  return { ctx, lead, business, recipient };
}

export async function recordWhatsAppMarketingOptIn(formData: FormData) {
  const leadId = required(formData, 'leadId');
  const sourceType = required(formData, 'sourceType').toUpperCase() as WhatsAppOptInSourceType;
  if (!WHATSAPP_OPT_IN_SOURCE_TYPES.includes(sourceType)) {
    throw new Error('Invalid WhatsApp opt-in source');
  }
  if (formData.get('attestation') !== 'on') {
    throw new Error('Explicit customer permission must be confirmed');
  }

  const occurredAt = new Date(required(formData, 'occurredAt'));
  if (!Number.isFinite(occurredAt.getTime())) throw new Error('Invalid opt-in time');
  if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
    throw new Error('Opt-in time cannot be in the future');
  }

  const { ctx, lead, business, recipient } = await loadCanonicalLead(leadId);
  if (lead.status === 'DO_NOT_CONTACT') throw new Error('Do-not-contact lead cannot be opted in without owner state review');
  if (lead.agent_mode !== 'AUTO') throw new Error('Lead automation must be AUTO before queuing a first touch');

  const verifiedAt = new Date().toISOString();
  const { data: evidence, error: evidenceError } = await ctx.supabase
    .from('lead_sources')
    .insert({
      organization_id: ctx.organizationId,
      lead_id: leadId,
      field_name: WHATSAPP_MARKETING_OPT_IN_FIELD,
      value: {
        consent: true,
        business_name: 'Smart Visions',
        purpose: 'MARKETING',
        recipient,
        opted_in_at: occurredAt.toISOString(),
      },
      source_type: sourceType,
      source_url: null,
      retrieved_at: verifiedAt,
      verified_at: verifiedAt,
      confidence: 1,
    })
    .select('id')
    .single();
  if (evidenceError) throw new Error(`WhatsApp opt-in persistence failed: ${evidenceError.message}`);

  const { data: existingConversation, error: conversationError } = await ctx.supabase
    .from('sales_conversations')
    .select('id,stage,agent_mode,requires_human')
    .eq('organization_id', ctx.organizationId)
    .eq('lead_id', leadId)
    .eq('channel', 'WHATSAPP')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (conversationError) throw new Error(`WhatsApp conversation lookup failed: ${conversationError.message}`);
  if (
    existingConversation
    && (
      existingConversation.agent_mode !== 'AUTO'
      || existingConversation.requires_human
      || ['DO_NOT_CONTACT', 'SPAM', 'PAUSED', 'WON', 'LOST'].includes(String(existingConversation.stage))
    )
  ) {
    throw new Error('Existing WhatsApp conversation state blocks automated first touch');
  }

  let conversationId = existingConversation?.id ? String(existingConversation.id) : '';
  if (!conversationId) {
    const { data: conversation, error: createError } = await ctx.supabase
      .from('sales_conversations')
      .insert({
        organization_id: ctx.organizationId,
        lead_id: leadId,
        channel: 'WHATSAPP',
        stage: 'NEW',
        agent_mode: 'AUTO',
      })
      .select('id')
      .single();
    if (createError) throw new Error(`WhatsApp conversation create failed: ${createError.message}`);
    conversationId = String(conversation.id);
  }

  const intro = buildSmartVisionsBusinessIntroOm(String(business.name));
  const queued = await queueShadowDraft({
    organizationId: ctx.organizationId,
    conversationId,
    leadId,
    channel: 'WHATSAPP',
    draft: intro.preview,
    idempotencyKey: `growth-first-touch:whatsapp-opt-in:${leadId}`,
    to: recipient,
    marketCode: 'OM',
    leadTimezone: 'Asia/Muscat',
    templateName: intro.templateName,
    templateLanguageCode: intro.templateLanguageCode,
    templateBodyParameters: intro.templateBodyParameters,
    replyLanguage: 'ar',
    replyDialect: 'omani',
    rememberCustomerLanguage: false,
  });

  const { error: auditError } = await ctx.supabase.from('audit_logs').insert({
    organization_id: ctx.organizationId,
    actor_type: 'USER',
    actor_id: ctx.userId,
    action: 'VERIFY_WHATSAPP_MARKETING_OPT_IN',
    entity_type: 'lead',
    entity_id: leadId,
    after_data: {
      evidenceId: evidence.id,
      sourceType,
      optedInAt: occurredAt.toISOString(),
      queuedMessageId: queued.messageId,
      duplicateDraft: queued.duplicate,
      templateName: intro.templateName,
      templateLanguageCode: intro.templateLanguageCode,
      shadowModeRemainsOn: true,
      providerSendTriggered: false,
    },
  });
  if (auditError) throw new Error(`WhatsApp opt-in audit failed: ${auditError.message}`);

  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/approvals');
}

export async function recordWhatsAppMarketingOptOut(formData: FormData) {
  const leadId = required(formData, 'leadId');
  const { ctx, recipient } = await loadCanonicalLead(leadId);
  const recordedAt = new Date().toISOString();

  const { error: evidenceError } = await ctx.supabase.from('lead_sources').insert({
    organization_id: ctx.organizationId,
    lead_id: leadId,
    field_name: WHATSAPP_MARKETING_OPT_OUT_FIELD,
    value: {
      consent: false,
      business_name: 'Smart Visions',
      purpose: 'MARKETING',
      recipient,
      opted_out_at: recordedAt,
    },
    source_type: 'CUSTOMER_WHATSAPP_MESSAGE',
    source_url: null,
    retrieved_at: recordedAt,
    verified_at: recordedAt,
    confidence: 1,
  });
  if (evidenceError) throw new Error(`WhatsApp opt-out persistence failed: ${evidenceError.message}`);

  const { error: leadError } = await ctx.supabase.from('leads')
    .update({ status: 'DO_NOT_CONTACT', updated_at: recordedAt })
    .eq('organization_id', ctx.organizationId)
    .eq('id', leadId);
  if (leadError) throw new Error(`Lead opt-out state update failed: ${leadError.message}`);

  const { error: suppressionError } = await ctx.supabase.from('suppression_list').insert({
    organization_id: ctx.organizationId,
    phone: recipient,
    reason: 'WHATSAPP_MARKETING_OPT_OUT',
    source: 'CONTROL_CENTER',
  });
  if (suppressionError) throw new Error(`WhatsApp suppression failed: ${suppressionError.message}`);

  await ctx.supabase.from('audit_logs').insert({
    organization_id: ctx.organizationId,
    actor_type: 'USER',
    actor_id: ctx.userId,
    action: 'RECORD_WHATSAPP_MARKETING_OPT_OUT',
    entity_type: 'lead',
    entity_id: leadId,
    after_data: { recipient, leadStatus: 'DO_NOT_CONTACT' },
  });

  revalidatePath('/leads');
  revalidatePath(`/leads/${leadId}`);
  revalidatePath('/approvals');
}

export async function sendApprovedWhatsAppOptInFirstTouch(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const messageId = required(formData, 'id');
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) throw new Error('INTERNAL_API_KEY is not configured');

  const response = await approvedSendPost(internalJsonRequest('/api/outreach/approved-send', internalKey, {
    organizationId: ctx.organizationId,
    messageId,
    priority: 'LOW',
    controlledWhatsAppOptInPilot: true,
  }));
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok && response.status !== 202) {
    throw new Error(typeof payload.error === 'string'
      ? payload.error
      : `WhatsApp opt-in first touch failed with HTTP ${response.status}`);
  }

  revalidatePath('/approvals');
  revalidatePath('/conversations');
  revalidatePath('/costs');
}
