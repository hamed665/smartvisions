import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ensureChatwootPublicConversationProjection } from '@/lib/chatwoot/public-conversation-projection';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type PublicWebChatErrorCode =
  | 'WIDGET_UNAVAILABLE'
  | 'ORIGIN_NOT_ALLOWED'
  | 'CONSENT_REQUIRED'
  | 'SESSION_UNAVAILABLE'
  | 'MESSAGE_INVALID'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE';

export class PublicWebChatError extends Error {
  constructor(readonly code: PublicWebChatErrorCode) {
    super(code);
  }
}

function normalizeOrigin(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.origin !== raw) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function mapRpcError(message: string): PublicWebChatError {
  if (/origin not allowed|origin mismatch/i.test(message)) return new PublicWebChatError('ORIGIN_NOT_ALLOWED');
  if (/consent required/i.test(message)) return new PublicWebChatError('CONSENT_REQUIRED');
  if (/session unavailable|session request/i.test(message)) return new PublicWebChatError('SESSION_UNAVAILABLE');
  if (/rate limit|message limit/i.test(message)) return new PublicWebChatError('RATE_LIMITED');
  if (/message (identity|length)|provider message scope/i.test(message)) return new PublicWebChatError('MESSAGE_INVALID');
  if (/widget unavailable/i.test(message)) return new PublicWebChatError('WIDGET_UNAVAILABLE');
  return new PublicWebChatError('SERVICE_UNAVAILABLE');
}

export function hashWebChatToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function webChatCorsHeaders(publicKey: string, requestOrigin: string | null) {
  const origin = normalizeOrigin(requestOrigin);
  if (!origin || !/^wc_[A-Za-z0-9_-]{24,80}$/.test(publicKey)) return null;
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('web_chat_widget_configs')
    .select('allowed_origins,enabled')
    .eq('public_key', publicKey)
    .eq('enabled', true)
    .maybeSingle();
  if (error || !data || !Array.isArray(data.allowed_origins) || !data.allowed_origins.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-WebChat-Session-Id,X-WebChat-Session-Token',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
}

export async function createPublicWebChatSession(input: {
  publicKey: string;
  origin: string;
  consentAccepted: boolean;
}) {
  const origin = normalizeOrigin(input.origin);
  if (!origin) throw new PublicWebChatError('ORIGIN_NOT_ALLOWED');

  const service = createSupabaseServiceClient();
  const sessionId = randomUUID();
  const sessionToken = randomBytes(32).toString('base64url');
  const tokenHash = hashWebChatToken(sessionToken);

  const { data, error } = await service.rpc('create_web_chat_session', {
    p_widget_public_key: input.publicKey,
    p_session_id: sessionId,
    p_token_hash: tokenHash,
    p_origin: origin,
    p_consent_accepted: input.consentAccepted,
  });
  if (error) throw mapRpcError(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.session_id || !row?.expires_at) throw new PublicWebChatError('SERVICE_UNAVAILABLE');

  return {
    sessionId: String(row.session_id),
    sessionToken,
    expiresAt: String(row.expires_at),
    maxMessageChars: Number(row.max_message_chars ?? 4000),
  };
}

export async function persistPublicWebChatMessage(input: {
  publicKey: string;
  origin: string;
  sessionId: string;
  sessionToken: string;
  clientMessageId: string;
  text: string;
}) {
  const origin = normalizeOrigin(input.origin);
  if (!origin) throw new PublicWebChatError('ORIGIN_NOT_ALLOWED');
  const service = createSupabaseServiceClient();

  const { data, error } = await service.rpc('journal_web_chat_inbound_message', {
    p_widget_public_key: input.publicKey,
    p_session_id: input.sessionId,
    p_token_hash: hashWebChatToken(input.sessionToken),
    p_origin: origin,
    p_client_message_id: input.clientMessageId,
    p_text: input.text,
  });
  if (error) throw mapRpcError(error.message);
  const journal = Array.isArray(data) ? data[0] : data;
  if (!journal?.organization_id || !journal?.tenant_business_id || !journal?.binding_id || !journal?.identity_id || !journal?.provider_message_id) {
    throw new PublicWebChatError('SERVICE_UNAVAILABLE');
  }

  const external = await ensureChatwootPublicConversationProjection({
    service,
    organizationId: String(journal.organization_id),
    tenantBusinessId: String(journal.tenant_business_id),
    bindingId: String(journal.binding_id),
    canonicalIdentityId: String(journal.identity_id),
    contactDisplayName: 'Website visitor',
  });
  const displayId = Number(external.conversation.id);
  const contactId = Number(external.contact.id);
  if (!Number.isSafeInteger(displayId) || displayId <= 0 || !Number.isSafeInteger(contactId) || contactId <= 0) {
    throw new PublicWebChatError('SERVICE_UNAVAILABLE');
  }

  const conversationUuid = typeof external.conversation.uuid === 'string' && external.conversation.uuid.trim()
    ? external.conversation.uuid.trim()
    : null;

  const projection = await service.rpc('project_web_chat_inbound_message', {
    p_organization_id: String(journal.organization_id),
    p_session_id: input.sessionId,
    p_provider_message_id: String(journal.provider_message_id),
    p_message_text: String(journal.message_text ?? input.text),
    p_chatwoot_conversation_display_id: displayId,
    p_chatwoot_conversation_uuid: conversationUuid,
    p_chatwoot_contact_id: contactId,
    p_occurred_at: new Date().toISOString(),
    p_request_key: `webchat:${String(journal.provider_message_id)}`.slice(0, 200),
  });
  if (projection.error) throw new PublicWebChatError('SERVICE_UNAVAILABLE');
  const projected = Array.isArray(projection.data) ? projection.data[0] : projection.data;
  if (!projected?.conversation_id || !projected?.message_id || !projected?.projection_id) {
    throw new PublicWebChatError('SERVICE_UNAVAILABLE');
  }

  return {
    accepted: true,
    clientMessageId: input.clientMessageId,
    messageId: String(projected.message_id),
    messageInserted: Boolean(projected.message_inserted),
  };
}


export async function getPublicWebChatConfig(input: {
  publicKey: string;
  origin: string;
}) {
  const origin = normalizeOrigin(input.origin);
  if (!origin) throw new PublicWebChatError('ORIGIN_NOT_ALLOWED');
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('web_chat_widget_configs')
    .select('public_key,allowed_origins,enabled,consent_required,max_message_chars,config')
    .eq('public_key', input.publicKey)
    .eq('enabled', true)
    .maybeSingle();
  if (error || !data) throw new PublicWebChatError('WIDGET_UNAVAILABLE');
  if (!Array.isArray(data.allowed_origins) || !data.allowed_origins.includes(origin)) {
    throw new PublicWebChatError('ORIGIN_NOT_ALLOWED');
  }
  const config = data.config && typeof data.config === 'object' && !Array.isArray(data.config)
    ? data.config as Record<string, unknown>
    : {};
  return {
    consentRequired: Boolean(data.consent_required),
    maxMessageChars: Number(data.max_message_chars ?? 4000),
    title: typeof config.title === 'string' ? config.title.trim().slice(0, 80) : 'Chat with us',
    welcomeMessage: typeof config.welcomeMessage === 'string'
      ? config.welcomeMessage.trim().slice(0, 500)
      : 'How can we help?',
    consentText: typeof config.consentText === 'string'
      ? config.consentText.trim().slice(0, 500)
      : 'I agree to use this chat to contact this business.',
  };
}

export async function readPublicWebChatMessages(input: {
  publicKey: string;
  origin: string;
  sessionId: string;
  sessionToken: string;
  after?: string | null;
  limit?: number;
}) {
  const origin = normalizeOrigin(input.origin);
  if (!origin) throw new PublicWebChatError('ORIGIN_NOT_ALLOWED');
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
  const service = createSupabaseServiceClient();
  const tokenHash = hashWebChatToken(input.sessionToken);

  const session = await service
    .from('web_chat_sessions')
    .select('id,organization_id,widget_config_id,conversation_id,origin,status,expires_at')
    .eq('id', input.sessionId)
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (session.error || !session.data) throw new PublicWebChatError('SESSION_UNAVAILABLE');
  if (
    session.data.status !== 'ACTIVE'
    || session.data.origin !== origin
    || new Date(String(session.data.expires_at)).getTime() <= Date.now()
  ) {
    throw new PublicWebChatError('SESSION_UNAVAILABLE');
  }

  const widget = await service
    .from('web_chat_widget_configs')
    .select('id,public_key,enabled,allowed_origins')
    .eq('organization_id', session.data.organization_id)
    .eq('id', session.data.widget_config_id)
    .eq('public_key', input.publicKey)
    .eq('enabled', true)
    .maybeSingle();
  if (
    widget.error
    || !widget.data
    || !Array.isArray(widget.data.allowed_origins)
    || !widget.data.allowed_origins.includes(origin)
  ) {
    throw new PublicWebChatError('WIDGET_UNAVAILABLE');
  }

  if (!session.data.conversation_id) {
    return { messages: [], hasMore: false };
  }

  let query = service
    .from('conversation_messages')
    .select('id,direction,original_text,status,created_at,sent_at')
    .eq('organization_id', session.data.organization_id)
    .eq('conversation_id', session.data.conversation_id)
    .eq('channel', 'WEB_CHAT')
    .in('direction', ['INBOUND', 'OUTBOUND'])
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1);

  if (input.after) {
    const afterDate = new Date(input.after);
    if (!Number.isFinite(afterDate.getTime())) throw new PublicWebChatError('MESSAGE_INVALID');
    query = query.gt('created_at', afterDate.toISOString());
  }

  const result = await query;
  if (result.error) throw new PublicWebChatError('SERVICE_UNAVAILABLE');
  const rows = result.data ?? [];
  const hasMore = rows.length > limit;
  return {
    messages: rows.slice(0, limit).map((row) => ({
      id: String(row.id),
      direction: row.direction === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND',
      text: String(row.original_text ?? ''),
      status: String(row.status ?? ''),
      createdAt: String(row.created_at),
      sentAt: row.sent_at ? String(row.sent_at) : null,
    })),
    hasMore,
  };
}
