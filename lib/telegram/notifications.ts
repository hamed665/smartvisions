import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getTelegramRuntimeConfig } from './config';
import { sendTelegramMessage } from './client';
import type { TelegramNotificationType } from './contracts';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for Telegram notifications');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function notifyTelegramOwner(input: {
  eventKey: string;
  notificationType: TelegramNotificationType;
  text: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  supabase?: SupabaseClient;
}) {
  const config = getTelegramRuntimeConfig();
  if (!config) return { sent: false, skipped: true, reason: 'NOT_CONFIGURED' as const };
  const supabase = input.supabase ?? serviceClient();
  const eventKey = input.eventKey.trim().slice(0, 240);
  if (!eventKey) throw new Error('Telegram notification event key is required');

  const { data: claimed, error: claimError } = await supabase.from('telegram_notification_events').insert({
    organization_id: config.organizationId,
    event_key: eventKey,
    notification_type: input.notificationType,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    payload: input.payload ?? {},
    status: 'PROCESSING',
  }).select('id').single();

  if (claimError) {
    if (claimError.code === '23505') return { sent: false, skipped: true, reason: 'DUPLICATE' as const };
    throw new Error(`Telegram notification claim failed: ${claimError.message}`);
  }

  try {
    const sent = await sendTelegramMessage({ chatId: config.ownerChatId, text: input.text });
    const { error: completeError } = await supabase.from('telegram_notification_events').update({
      status: 'SENT',
      telegram_message_id: sent.messageId,
      sent_at: new Date().toISOString(),
      error: null,
    }).eq('organization_id', config.organizationId).eq('id', claimed.id).eq('status', 'PROCESSING');
    if (completeError) return { sent: true, messageId: sent.messageId, reconciliationRequired: true };
    return { sent: true, messageId: sent.messageId, reconciliationRequired: false };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : 'Telegram notification failed';
    await supabase.from('telegram_notification_events').update({ status: 'FAILED', error: message }).eq('organization_id', config.organizationId).eq('id', claimed.id).eq('status', 'PROCESSING');
    return { sent: false, skipped: false, error: message, automaticRetry: false };
  }
}

export function normalizeWhatsAppLink(raw: unknown) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (/^https:\/\/wa\.me\//i.test(text) || /^https:\/\/api\.whatsapp\.com\//i.test(text)) return text;
  const digits = text.replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

export async function notifyTelegramOwnerNewLead(input: {
  organizationId: string;
  leadId: string;
  supabase?: SupabaseClient;
}) {
  const config = getTelegramRuntimeConfig();
  if (!config || config.organizationId !== input.organizationId) return { sent: false, skipped: true, reason: 'NOT_CONFIGURED' as const };
  const supabase = input.supabase ?? serviceClient();
  const { data: lead, error: leadError } = await supabase.from('leads').select('id,status,opportunity_score,intent_score,recommended_offer,business_id').eq('organization_id', input.organizationId).eq('id', input.leadId).maybeSingle();
  if (leadError || !lead) return { sent: false, skipped: true, reason: 'LEAD_NOT_FOUND' as const };
  const [{ data: business }, { data: conversation }] = await Promise.all([
    lead.business_id ? supabase.from('businesses').select('id,name,city,country_code,category,whatsapp,international_phone,phone').eq('organization_id', input.organizationId).eq('id', lead.business_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from('sales_conversations').select('id,persian_summary,summary,stage,intent_label,sentiment_label').eq('organization_id', input.organizationId).eq('lead_id', input.leadId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const whatsapp = normalizeWhatsAppLink(business?.whatsapp ?? business?.international_phone ?? business?.phone);
  const summary = String(conversation?.persian_summary ?? conversation?.summary ?? '').trim();
  const text = [
    '🆕 لید جدید',
    `Business: ${business?.name ?? input.leadId}`,
    [business?.city, business?.country_code, business?.category].filter(Boolean).join(' · '),
    `Opportunity: ${lead.opportunity_score ?? 0} · Intent: ${lead.intent_score ?? 0}`,
    lead.recommended_offer ? `Offer: ${lead.recommended_offer}` : '',
    summary ? `خلاصه: ${summary.slice(0, 900)}` : '',
    whatsapp ? `WhatsApp: ${whatsapp}` : 'WhatsApp: پیدا نشد',
  ].filter(Boolean).join('\n');
  return notifyTelegramOwner({ eventKey: `lead:${input.leadId}:created`, notificationType: 'NEW_LEAD', text, entityType: 'lead', entityId: input.leadId, payload: { whatsapp, conversationId: conversation?.id ?? null }, supabase });
}
