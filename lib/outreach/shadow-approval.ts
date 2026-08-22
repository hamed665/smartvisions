import { createClient } from '@supabase/supabase-js';
import { getRuntimeControls } from '@/lib/reliability/runtime-controls';

export type ShadowDraftChannel = 'EMAIL' | 'WHATSAPP';

export type ShadowDraftInput = {
  organizationId: string;
  conversationId: string;
  leadId?: string;
  channel: ShadowDraftChannel;
  draft: string;
  idempotencyKey: string;
  to: string;
  subject?: string;
  marketCode?: string;
  leadTimezone?: string;
  lastCustomerMessageAt?: string;
  templateName?: string;
  templateLanguageCode?: string;
  replyLanguage?: string;
  replyDialect?: string;
  persianTranslation?: string;
  persianSummary?: string;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for shadow approval queue');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function shadowProviderMessageId(idempotencyKey: string) {
  const normalized = idempotencyKey.trim();
  if (!normalized) throw new Error('idempotencyKey is required');
  return `shadow:${normalized}`;
}

export async function queueShadowDraft(input: ShadowDraftInput) {
  if (!input.organizationId || !input.conversationId || !input.to || !input.draft.trim()) {
    throw new Error('organizationId, conversationId, to and draft are required');
  }

  const controls = await getRuntimeControls(input.organizationId);
  if (!controls?.shadow_mode) throw new Error('Shadow approval queue is only available while Shadow Mode is enabled');

  const supabase = serviceClient();
  const { data: conversation, error: conversationError } = await supabase
    .from('sales_conversations')
    .select('id,organization_id,lead_id,channel')
    .eq('organization_id', input.organizationId)
    .eq('id', input.conversationId)
    .maybeSingle();
  if (conversationError) throw new Error(`Conversation lookup failed: ${conversationError.message}`);
  if (!conversation) throw new Error('Conversation not found');
  if (conversation.channel !== input.channel) throw new Error('Draft channel does not match conversation channel');
  if (input.leadId && conversation.lead_id && input.leadId !== conversation.lead_id) throw new Error('Draft lead does not match conversation lead');

  const providerMessageId = shadowProviderMessageId(input.idempotencyKey);
  const row = {
    organization_id: input.organizationId,
    conversation_id: input.conversationId,
    lead_id: input.leadId ?? conversation.lead_id ?? null,
    provider_message_id: providerMessageId,
    channel: input.channel,
    direction: 'OUTBOUND',
    media_type: 'TEXT',
    original_text: input.draft.trim(),
    persian_translation: input.persianTranslation ?? null,
    persian_summary: input.persianSummary ?? null,
    reply_language: input.replyLanguage ?? null,
    reply_dialect: input.replyDialect ?? null,
    requires_approval: true,
    approval_reason: 'SHADOW_MODE_REVIEW',
    status: 'APPROVAL_REQUIRED',
    metadata: {
      source: 'SHADOW_MODE',
      idempotency_key: input.idempotencyKey,
      send_context: {
        to: input.to,
        subject: input.subject ?? null,
        market_code: input.marketCode ?? null,
        lead_timezone: input.leadTimezone ?? null,
        last_customer_message_at: input.lastCustomerMessageAt ?? null,
        template_name: input.templateName ?? null,
        template_language_code: input.templateLanguageCode ?? null,
      },
    },
  };

  const { data, error } = await supabase
    .from('conversation_messages')
    .upsert(row, {
      onConflict: 'organization_id,channel,provider_message_id',
      ignoreDuplicates: true,
    })
    .select('id,status,requires_approval')
    .maybeSingle();
  if (error) throw new Error(`Shadow approval queue failed: ${error.message}`);

  if (data) return { queued: true, duplicate: false, messageId: data.id, status: data.status };

  const { data: existing, error: existingError } = await supabase
    .from('conversation_messages')
    .select('id,status,requires_approval')
    .eq('organization_id', input.organizationId)
    .eq('channel', input.channel)
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  if (existingError) throw new Error(`Shadow approval duplicate lookup failed: ${existingError.message}`);
  if (!existing) throw new Error('Shadow approval draft was not persisted');
  return { queued: false, duplicate: true, messageId: existing.id, status: existing.status };
}
