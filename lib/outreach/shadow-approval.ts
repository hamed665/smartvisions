import { createClient } from '@supabase/supabase-js';
import { getRuntimeControls } from '@/lib/reliability/runtime-controls';
import { evaluateGrowthFirstTouchChannelPolicy } from '@/lib/outreach/first-touch-channel-policy';
import { assertSmartVisionsCatalogContentId } from '@/lib/whatsapp/catalog';

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
  html?: string;
  mailboxId?: string;
  marketCode?: string;
  leadTimezone?: string;
  lastCustomerMessageAt?: string;
  templateName?: string;
  templateLanguageCode?: string;
  catalogContentId?: string;
  replyLanguage?: string;
  replyDialect?: string;
  persianTranslation?: string;
  persianSummary?: string;
  rememberCustomerLanguage?: boolean;
};

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for shadow approval queue');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function shadowProviderMessageId(idempotencyKey: string) {
  const normalized = idempotencyKey.trim();
  if (!normalized) throw new Error('idempotencyKey is required');
  return `shadow:${normalized}`;
}

export function isShadowDuplicateError(code?: string | null) {
  return code === '23505';
}

function normalizedLanguageTag(value?: string) {
  const language = String(value ?? '').trim();
  if (!language || language.toLowerCase() === 'und' || language.length > 32) return null;
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language) ? language : null;
}

async function persistCustomerLanguageMemory(input: {
  supabase: ReturnType<typeof serviceClient>;
  draft: ShadowDraftInput;
}) {
  if (!input.draft.rememberCustomerLanguage) return { persisted: false as const, reason: 'NOT_REQUESTED' as const };
  const language = normalizedLanguageTag(input.draft.replyLanguage);
  if (!language) return { persisted: false as const, reason: 'LANGUAGE_UNRESOLVED' as const };
  const dialect = language.toLowerCase().startsWith('ar') ? input.draft.replyDialect ?? null : null;
  const { error } = await input.supabase.from('sales_conversations').update({
    detected_language: language,
    detected_dialect: dialect,
    updated_at: new Date().toISOString(),
  }).eq('organization_id', input.draft.organizationId).eq('id', input.draft.conversationId);
  if (error) return { persisted: false as const, reason: 'PERSIST_FAILED' as const };
  return { persisted: true as const, language, dialect };
}

export async function queueShadowDraft(input: ShadowDraftInput) {
  if (!input.organizationId || !input.conversationId || !input.to || !input.draft.trim()) {
    throw new Error('organizationId, conversationId, to and draft are required');
  }
  if (input.channel === 'EMAIL' && (!input.subject || !input.mailboxId)) {
    throw new Error('Email shadow drafts require subject and mailboxId');
  }
  if (input.catalogContentId) {
    if (input.channel !== 'WHATSAPP') throw new Error('Catalog products can only be attached to WhatsApp drafts');
    assertSmartVisionsCatalogContentId(input.catalogContentId);
  }

  const controls = await getRuntimeControls(input.organizationId);
  if (!controls?.shadow_mode) throw new Error('Shadow approval queue is only available while Shadow Mode is enabled');

  const supabase = serviceClient();
  let resolvedTemplateName = input.templateName?.trim() || undefined;
  let resolvedTemplateLanguageCode = input.templateLanguageCode?.trim() || undefined;

  if (input.idempotencyKey.trim().startsWith('growth-first-touch:')) {
    const marketCode = String(input.marketCode ?? '').trim().toUpperCase();
    if (marketCode !== 'OM') throw new Error('Growth first-touch cold outreach is currently restricted to market OM');

    const { data: market, error: marketError } = await supabase
      .from('market_settings')
      .select('enabled,config')
      .eq('organization_id', input.organizationId)
      .eq('country_code', marketCode)
      .maybeSingle();
    if (marketError || !market) {
      throw new Error(`Growth first-touch market policy unavailable: ${marketError?.message ?? 'not found'}`);
    }

    const config = record(market.config);
    if (input.channel === 'WHATSAPP') {
      resolvedTemplateName = resolvedTemplateName
        ?? (typeof config.whatsappColdTemplateName === 'string' ? config.whatsappColdTemplateName.trim() || undefined : undefined);
      resolvedTemplateLanguageCode = resolvedTemplateLanguageCode
        ?? (typeof config.whatsappColdTemplateLanguageCode === 'string' ? config.whatsappColdTemplateLanguageCode.trim() || undefined : undefined);
    }

    const channelPolicy = evaluateGrowthFirstTouchChannelPolicy({
      channel: input.channel,
      marketEnabled: Boolean(market.enabled),
      coldEmailEnabled: config.coldEmailEnabled === true,
      whatsappColdEnabled: config.whatsappColdEnabled === true,
      whatsappTemplateName: resolvedTemplateName,
      whatsappTemplateLanguageCode: resolvedTemplateLanguageCode,
    });
    if (!channelPolicy.allowed) {
      throw new Error(`Growth first-touch blocked by canonical channel policy (${channelPolicy.reason})`);
    }
  }

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
        html: input.html ?? null,
        mailbox_id: input.mailboxId ?? null,
        market_code: input.marketCode ?? null,
        lead_timezone: input.leadTimezone ?? null,
        last_customer_message_at: input.lastCustomerMessageAt ?? null,
        template_name: resolvedTemplateName ?? null,
        template_language_code: resolvedTemplateLanguageCode ?? null,
        catalog_content_id: input.catalogContentId ?? null,
      },
    },
  };

  const { data, error } = await supabase
    .from('conversation_messages')
    .insert(row)
    .select('id,status,requires_approval')
    .maybeSingle();
  if (!error && data) {
    const languageMemory = await persistCustomerLanguageMemory({ supabase, draft: input });
    return { queued: true, duplicate: false, messageId: data.id, status: data.status, languageMemory };
  }
  if (error && !isShadowDuplicateError(error.code)) throw new Error(`Shadow approval queue failed: ${error.message}`);

  const { data: existing, error: existingError } = await supabase
    .from('conversation_messages')
    .select('id,status,requires_approval')
    .eq('organization_id', input.organizationId)
    .eq('channel', input.channel)
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  if (existingError) throw new Error(`Shadow approval duplicate lookup failed: ${existingError.message}`);
  if (!existing) throw new Error('Shadow approval draft was not persisted');
  const languageMemory = await persistCustomerLanguageMemory({ supabase, draft: input });
  return { queued: false, duplicate: true, messageId: existing.id, status: existing.status, languageMemory };
}
