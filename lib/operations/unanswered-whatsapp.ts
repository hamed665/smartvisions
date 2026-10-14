import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyOperationalAlert } from './alerts';
import { getTelegramRuntimeConfig } from '@/lib/telegram/config';

export const WHATSAPP_UNANSWERED_AFTER_MINUTES = 8;
const SCAN_LOOKBACK_HOURS = 24;
const MAX_INBOUND_PER_TICK = 250;
const MAX_CONVERSATIONS_PER_TICK = 60;

type CanonicalInbound = {
  id: string;
  organization_id: string;
  conversation_id: string;
  lead_id: string;
  provider_message_id: string;
  created_at: string;
};

export function unansweredWhatsAppCandidate(input: {
  now: Date;
  lastInboundAt: string | null;
  stage?: string | null;
}): boolean {
  const lastInboundMs = Date.parse(input.lastInboundAt ?? '');
  if (!Number.isFinite(lastInboundMs)) return false;
  const age = input.now.getTime() - lastInboundMs;
  if (age < WHATSAPP_UNANSWERED_AFTER_MINUTES * 60_000
    || age > SCAN_LOOKBACK_HOURS * 60 * 60_000) return false;
  if (['DO_NOT_CONTACT', 'SPAM'].includes(String(input.stage ?? '').toUpperCase())) return false;
  return true;
}

/** Alert from the canonical inbound/outbound ledger; no customer send here. */
export async function alertOnUnansweredWhatsApp(
  supabase: SupabaseClient,
  now: Date,
): Promise<{ examined: number; alerted: number; failed: number }> {
  // The current owner Telegram plane is bound to exactly ONE organization.
  // Never forward another tenant's lead/conversation metadata to its owner.
  const telegram = getTelegramRuntimeConfig();
  if (!telegram) return { examined: 0, alerted: 0, failed: 1 };
  const earliest = new Date(now.getTime() - SCAN_LOOKBACK_HOURS * 3_600_000).toISOString();
  const { data, error } = await supabase.from('conversation_messages')
    .select('id,organization_id,conversation_id,lead_id,provider_message_id,created_at')
    .eq('organization_id', telegram.organizationId)
    .eq('channel', 'WHATSAPP')
    .eq('direction', 'INBOUND')
    .eq('provenance', 'CUSTOMER')
    .eq('source_plane', 'META_WHATSAPP')
    .gte('created_at', earliest)
    .lte('created_at', now.toISOString())
    .order('created_at', { ascending: false })
    .limit(MAX_INBOUND_PER_TICK);
  if (error) throw new Error('UNANSWERED_WA_DISCOVERY_FAILED');

  const latestByConversation = new Map<string, CanonicalInbound>();
  for (const message of (data ?? []) as CanonicalInbound[]) {
    if (!message.id || message.organization_id !== telegram.organizationId || !message.conversation_id ||
        !message.lead_id || !message.provider_message_id) continue;
    const key = message.organization_id + ':' + message.conversation_id;
    if (!latestByConversation.has(key)) latestByConversation.set(key, message);
    if (latestByConversation.size >= MAX_CONVERSATIONS_PER_TICK) break;
  }

  let examined = 0, alerted = 0, failed = 0;
  for (const inbound of latestByConversation.values()) {
    if (!unansweredWhatsAppCandidate({ now, lastInboundAt: inbound.created_at })) continue;
    examined++;
    try {
      const conversation = await supabase.from('sales_conversations')
        .select('id,lead_id,channel,stage,agent_mode,requires_human')
        .eq('organization_id', inbound.organization_id)
        .eq('id', inbound.conversation_id)
        .maybeSingle();
      if (conversation.error) { failed++; continue; }
      if (!conversation.data || conversation.data.lead_id !== inbound.lead_id ||
          conversation.data.channel !== 'WHATSAPP' ||
          !unansweredWhatsAppCandidate({ now, lastInboundAt: inbound.created_at, stage: conversation.data.stage })) continue;

      // Only a provider-sent human/AI reply counts, not a queued Shadow draft.
      const sent = await supabase.from('conversation_messages')
        .select('id')
        .eq('organization_id', inbound.organization_id)
        .eq('conversation_id', inbound.conversation_id)
        .eq('channel', 'WHATSAPP')
        .eq('direction', 'OUTBOUND')
        .eq('status', 'SENT')
        .gte('sent_at', inbound.created_at)
        .limit(1)
        .maybeSingle();
      if (sent.error) { failed++; continue; }
      if (sent.data?.id) continue;

      const notification = await notifyOperationalAlert({
        supabase,
        organizationId: inbound.organization_id,
        code: 'CUSTOMER_UNANSWERED',
        eventKey: 'unanswered-wa:' + inbound.id,
        detail: 'A real customer WhatsApp message has no provider-sent reply after '
          + WHATSAPP_UNANSWERED_AFTER_MINUTES
          + ' minutes. Check the unified inbox and respond or assign a human. No customer message was auto-sent. Conversation: '
          + inbound.conversation_id,
        entityType: 'conversation',
        entityId: inbound.conversation_id,
        payload: {
          inboundMessageId: inbound.id,
          leadId: inbound.lead_id,
          agentMode: conversation.data.agent_mode,
          requiresHuman: Boolean(conversation.data.requires_human),
          stage: conversation.data.stage,
          policy: 'OWNER_ALERT_ONLY_NO_AUTO_SEND',
        },
      });
      if (notification.sent) alerted++;
      else if (!notification.skipped) failed++;
    } catch {
      failed++;
    }
  }
  return { examined, alerted, failed };
}
