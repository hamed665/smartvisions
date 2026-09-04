import { createClient } from '@supabase/supabase-js';
import { isDoNotContactReply, persistCustomerDoNotContact, persistCustomerReplyConversationState } from '@/lib/conversations/sales-lifecycle';
import type { NormalizedWhatsAppInbound, NormalizedWhatsAppStatus } from './webhook';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for WhatsApp lifecycle handling');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function normalizePhoneDigits(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '');
}

export function phonesRepresentSameNumber(targetValue?: string | null, candidateValue?: string | null) {
  const target = normalizePhoneDigits(targetValue);
  const candidate = normalizePhoneDigits(candidateValue);
  if (target.length < 8 || candidate.length < 8) return false;
  return target === candidate || target.endsWith(candidate) || candidate.endsWith(target);
}

export function isWhatsAppInboundDuplicateError(code?: string | null) {
  return code === '23505';
}

export function mapWhatsAppDeliveryStatus(status: NormalizedWhatsAppStatus['status']) {
  switch (status) {
    case 'sent': return 'SENT';
    case 'delivered': return 'DELIVERED';
    case 'read': return 'READ';
    case 'failed': return 'FAILED';
    case 'deleted': return 'DELETED';
    default: return 'UNKNOWN';
  }
}

async function resolveLeadByPhone(organizationId: string, from: string) {
  const supabase = serviceClient();
  const target = normalizePhoneDigits(from);
  if (target.length < 8) return null;
  const suffix = target.slice(-8);

  const { data: businesses, error: businessError } = await supabase
    .from('businesses')
    .select('id,phone,whatsapp')
    .eq('organization_id', organizationId)
    .or(`phone.ilike.%${suffix}%,whatsapp.ilike.%${suffix}%`)
    .limit(20);
  if (businessError) throw new Error(`WhatsApp business lookup failed: ${businessError.message}`);

  const exact = (businesses ?? []).filter(row =>
    phonesRepresentSameNumber(target, row.phone) || phonesRepresentSameNumber(target, row.whatsapp),
  );
  if (exact.length !== 1) return null;

  const { data: leads, error: leadError } = await supabase
    .from('leads')
    .select('id,status,agent_mode')
    .eq('organization_id', organizationId)
    .eq('business_id', exact[0].id)
    .order('updated_at', { ascending: false })
    .limit(2);
  if (leadError) throw new Error(`WhatsApp lead lookup failed: ${leadError.message}`);
  return leads?.length === 1 ? leads[0] : null;
}

async function getOrCreateConversation(organizationId: string, leadId: string, receivedAt: string) {
  const supabase = serviceClient();
  const { data: existing, error: existingError } = await supabase
    .from('sales_conversations')
    .select('id,agent_mode')
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .eq('channel', 'WHATSAPP')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`WhatsApp conversation lookup failed: ${existingError.message}`);
  if (existing) {
    const { error } = await supabase.from('sales_conversations').update({ last_message_at: receivedAt, updated_at: new Date().toISOString() }).eq('id', existing.id).eq('organization_id', organizationId);
    if (error) throw new Error(`WhatsApp conversation update failed: ${error.message}`);
    return existing;
  }

  const { data, error } = await supabase.from('sales_conversations').insert({
    organization_id: organizationId,
    lead_id: leadId,
    channel: 'WHATSAPP',
    agent_mode: 'AUTO',
    last_message_at: receivedAt,
  }).select('id,agent_mode').single();
  if (error) throw new Error(`WhatsApp conversation create failed: ${error.message}`);
  return data;
}

export async function applyWhatsAppInboundLifecycle(organizationId: string, event: NormalizedWhatsAppInbound) {
  const supabase = serviceClient();
  const lead = await resolveLeadByPhone(organizationId, event.from);
  if (!lead) return { linked: false as const };

  const receivedAt = event.timestamp ? new Date(Number(event.timestamp) * 1000).toISOString() : new Date().toISOString();
  const conversation = await getOrCreateConversation(organizationId, lead.id, receivedAt);
  const body = event.text?.trim() || (event.type === 'audio' ? '[WhatsApp voice message]' : `[WhatsApp ${event.type} message]`);
  const idempotencyKey = `whatsapp:inbound:${event.providerMessageId}`;

  const { error: messageError } = await supabase.from('outreach_messages').insert({
    organization_id: organizationId,
    lead_id: lead.id,
    channel: 'WHATSAPP',
    direction: 'INBOUND',
    status: 'RECEIVED',
    provider_message_id: event.providerMessageId,
    body,
    idempotency_key: idempotencyKey,
    received_at: receivedAt,
    metadata: { conversation_id: conversation.id, type: event.type, media_id: event.mediaId ?? null, mime_type: event.mimeType ?? null, voice: Boolean(event.voice) },
  });
  if (messageError && !isWhatsAppInboundDuplicateError(messageError.code)) {
    throw new Error(`WhatsApp inbound message persistence failed: ${messageError.message}`);
  }

  if (isDoNotContactReply(body)) {
    await persistCustomerDoNotContact({
      supabase,
      organizationId,
      leadId: lead.id,
      conversationId: conversation.id,
      phone: event.from,
      source: 'WHATSAPP_INBOUND',
    });
    return { linked: true as const, leadId: lead.id, conversationId: conversation.id, agentMode: 'PAUSED' as const, doNotContact: true as const };
  }

  const terminal = new Set(['WON','LOST','DO_NOT_CONTACT','HUMAN']);
  if (!terminal.has(String(lead.status))) {
    await persistCustomerReplyConversationState({
      supabase,
      organizationId,
      leadId: lead.id,
      conversationId: conversation.id,
    });

    const { error } = await supabase.from('leads').update({ status: 'REPLIED', updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', lead.id);
    if (error) throw new Error(`WhatsApp lead lifecycle update failed: ${error.message}`);
  }

  const { error: followupError } = await supabase.from('followup_jobs').update({ status: 'CANCELLED', stop_reason: 'CUSTOMER_REPLIED' }).eq('organization_id', organizationId).eq('lead_id', lead.id).eq('status', 'PENDING');
  if (followupError) throw new Error(`WhatsApp follow-up cancellation failed: ${followupError.message}`);

  return { linked: true as const, leadId: lead.id, conversationId: conversation.id, agentMode: lead.agent_mode };
}

export async function applyWhatsAppStatusLifecycle(organizationId: string, event: NormalizedWhatsAppStatus) {
  const supabase = serviceClient();
  const status = mapWhatsAppDeliveryStatus(event.status);
  const { data, error } = await supabase.from('outreach_messages').update({
    status,
    metadata: { whatsapp_status: event.status, conversation_id: event.conversationId ?? null, pricing_category: event.pricingCategory ?? null, error_code: event.errorCode ?? null, error_title: event.errorTitle ?? null },
  }).eq('organization_id', organizationId).eq('provider_message_id', event.providerMessageId).eq('channel', 'WHATSAPP').select('id');
  if (error) throw new Error(`WhatsApp delivery status update failed: ${error.message}`);
  return { matched: data?.length ?? 0, status };
}
