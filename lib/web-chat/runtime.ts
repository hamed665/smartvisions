import 'server-only';

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  createChatwootPublicIncomingMessage,
  ensureChatwootPublicConversationProjection,
  type ChatwootPublicIncomingAttachment,
} from '@/lib/chatwoot/public-conversation-projection';
import {
  claimWebChatChatwootSync,
  finalizeWebChatChatwootSync,
} from '@/lib/web-chat/chatwoot-inbound-sync';
import { isSafeChatwootAttachmentUrl } from '@/lib/chatwoot/conversation-actions';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export type PublicWebChatErrorCode =
  | 'WIDGET_UNAVAILABLE'
  | 'ORIGIN_NOT_ALLOWED'
  | 'CONSENT_REQUIRED'
  | 'SESSION_UNAVAILABLE'
  | 'MESSAGE_INVALID'
  | 'RATE_LIMITED'
  | 'RECONCILIATION_REQUIRED'
  | 'ATTACHMENT_UNAVAILABLE'
  | 'SERVICE_UNAVAILABLE';

export class PublicWebChatError extends Error {
  constructor(readonly code: PublicWebChatErrorCode) {
    super(code);
  }
}

const MAX_PUBLIC_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const SAFE_INLINE_ATTACHMENT_TYPES = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'audio/mpeg','audio/ogg','audio/wav','audio/webm',
  'video/mp4','video/webm',
]);

function webChatObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveChatwootId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
}

function safeAttachmentExtension(value: unknown) {
  if (typeof value !== 'string') return null;
  const extension = value.trim().toLowerCase();
  return /^[a-z0-9]{1,12}$/.test(extension) ? extension : null;
}

type PublicWebChatAttachment = {
  id: number | null;
  messageId: number | null;
  name: string;
  contentType: string | null;
  fileSize: number | null;
  downloadable: boolean;
};

function publicAttachmentMetadata(direction: unknown, metadata: unknown) {
  const record = webChatObject(metadata);
  const raw = Array.isArray(record?.attachments) ? record.attachments : [];
  return raw.slice(0, 10).flatMap<PublicWebChatAttachment>((value) => {
    const attachment = webChatObject(value);
    if (!attachment) return [];
    const contentType = typeof attachment.contentType === 'string'
      ? attachment.contentType.trim().slice(0, 120)
      : null;
    const rawSize = Number(attachment.size);
    const fileSize = Number.isSafeInteger(rawSize) && rawSize >= 0 ? rawSize : null;

    if (direction === 'OUTBOUND') {
      const id = positiveChatwootId(attachment.id);
      const messageId = positiveChatwootId(attachment.messageId);
      if (id === null || messageId === null) return [];
      const extension = safeAttachmentExtension(attachment.extension);
      return [{
        id,
        messageId,
        name: `attachment-${id}${extension ? `.${extension}` : ''}`,
        contentType,
        fileSize,
        downloadable: fileSize === null || fileSize <= MAX_PUBLIC_ATTACHMENT_BYTES,
      }];
    }

    const name = typeof attachment.name === 'string'
      ? attachment.name.trim().slice(0, 180)
      : 'attachment';
    return [{
      id: null,
      messageId: null,
      name: name || 'attachment',
      contentType,
      fileSize,
      downloadable: false,
    }];
  });
}

function boundedPublicAttachmentStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  let total = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        reader.releaseLock();
        return;
      }
      if (!value) return;
      total += value.byteLength;
      if (total > MAX_PUBLIC_ATTACHMENT_BYTES) {
        await reader.cancel();
        controller.error(new Error('Web Chat attachment exceeded the safe download limit'));
        return;
      }
      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
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
  if (/reconciliation/i.test(message)) return new PublicWebChatError('RECONCILIATION_REQUIRED');
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
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
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
  attachments?: ChatwootPublicIncomingAttachment[];
}) {
  const origin = normalizeOrigin(input.origin);
  if (!origin) throw new PublicWebChatError('ORIGIN_NOT_ALLOWED');
  const attachments = input.attachments ?? [];
  const journalText = input.text.trim() || (attachments.length ? '[Attachment]' : '');
  const service = createSupabaseServiceClient();

  const { data, error } = await service.rpc('journal_web_chat_inbound_message', {
    p_widget_public_key: input.publicKey,
    p_session_id: input.sessionId,
    p_token_hash: hashWebChatToken(input.sessionToken),
    p_origin: origin,
    p_client_message_id: input.clientMessageId,
    p_text: journalText,
  });
  if (error) throw mapRpcError(error.message);
  const journal = Array.isArray(data) ? data[0] : data;
  if (!journal?.organization_id || !journal?.tenant_business_id || !journal?.binding_id || !journal?.identity_id || !journal?.provider_message_id) {
    throw new PublicWebChatError('SERVICE_UNAVAILABLE');
  }

  const organizationId = String(journal.organization_id);
  const tenantBusinessId = String(journal.tenant_business_id);
  const bindingId = String(journal.binding_id);
  const identityId = String(journal.identity_id);
  const providerMessageId = String(journal.provider_message_id);

  const external = await ensureChatwootPublicConversationProjection({
    service,
    organizationId,
    tenantBusinessId,
    bindingId,
    canonicalIdentityId: identityId,
    contactDisplayName: 'Website visitor',
  });
  const displayId = Number(external.conversation.id);
  const contactId = Number(external.contact.id);
  if (!Number.isSafeInteger(displayId) || displayId <= 0 || !Number.isSafeInteger(contactId) || contactId <= 0) {
    throw new PublicWebChatError('SERVICE_UNAVAILABLE');
  }

  const claim = await claimWebChatChatwootSync({
    service,
    organizationId,
    sessionId: input.sessionId,
    providerMessageId,
  });

  if (claim.claimed) {
    let acceptedMessageId: number | null = null;
    try {
      const accepted = await createChatwootPublicIncomingMessage({
        service,
        organizationId,
        tenantBusinessId,
        bindingId,
        canonicalIdentityId: identityId,
        conversationDisplayId: displayId,
        requestId: `webchat:${input.clientMessageId}`.slice(0, 160),
        content: input.text.trim() || null,
        attachments,
      });
      acceptedMessageId = accepted.chatwootMessageId;
    } catch {
      try {
        await finalizeWebChatChatwootSync({
          service,
          eventId: claim.eventId,
          status: 'RECONCILIATION_REQUIRED',
        });
      } catch {
        // PROCESSING remains fail-closed: later requests never cross the provider boundary again.
      }
      throw new PublicWebChatError('RECONCILIATION_REQUIRED');
    }

    try {
      await finalizeWebChatChatwootSync({
        service,
        eventId: claim.eventId,
        status: 'ACCEPTED',
        chatwootMessageId: acceptedMessageId,
      });
    } catch {
      // Chatwoot accepted the side effect; never retry the provider call automatically.
      throw new PublicWebChatError('RECONCILIATION_REQUIRED');
    }
  } else if (claim.syncStatus !== 'ACCEPTED') {
    throw new PublicWebChatError('RECONCILIATION_REQUIRED');
  }

  const conversationUuid = typeof external.conversation.uuid === 'string' && external.conversation.uuid.trim()
    ? external.conversation.uuid.trim()
    : null;

  const projection = await service.rpc('project_web_chat_inbound_message', {
    p_organization_id: organizationId,
    p_session_id: input.sessionId,
    p_provider_message_id: providerMessageId,
    p_message_text: String(journal.message_text ?? journalText),
    p_chatwoot_conversation_display_id: displayId,
    p_chatwoot_conversation_uuid: conversationUuid,
    p_chatwoot_contact_id: contactId,
    p_occurred_at: new Date().toISOString(),
    p_request_key: `webchat:${providerMessageId}`.slice(0, 200),
  });
  if (projection.error) throw new PublicWebChatError('SERVICE_UNAVAILABLE');
  const projected = Array.isArray(projection.data) ? projection.data[0] : projection.data;
  if (!projected?.conversation_id || !projected?.message_id || !projected?.projection_id) {
    throw new PublicWebChatError('SERVICE_UNAVAILABLE');
  }

  if (attachments.length > 0) {
    const mediaType = attachments.length === 1
      ? attachments[0].contentType.startsWith('image/') ? 'IMAGE'
        : attachments[0].contentType.startsWith('video/') ? 'VIDEO'
          : attachments[0].contentType.startsWith('audio/') ? 'AUDIO'
            : 'DOCUMENT'
      : 'OTHER';
    const metadata = attachments.map((attachment) => ({
      name: attachment.filename.slice(0, 180),
      contentType: attachment.contentType.slice(0, 120),
      size: attachment.blob.size,
    }));
    const annotation = await service.rpc('annotate_web_chat_message_media', {
      p_organization_id: organizationId,
      p_message_id: String(projected.message_id),
      p_media_type: mediaType,
      p_attachments: metadata,
    });
    if (annotation.error) throw new PublicWebChatError('SERVICE_UNAVAILABLE');
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
    .select('id,direction,media_type,original_text,status,metadata,created_at,sent_at')
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
      mediaType: String(row.media_type ?? 'TEXT'),
      attachments: publicAttachmentMetadata(row.direction, row.metadata),
    })),
    hasMore,
  };
}


export async function downloadPublicWebChatAttachment(input: {
  publicKey: string;
  origin: string;
  sessionId: string;
  sessionToken: string;
  attachmentId: number;
  messageId: number;
  fetchImpl?: typeof fetch;
}) {
  const origin = normalizeOrigin(input.origin);
  const attachmentId = positiveChatwootId(input.attachmentId);
  const messageId = positiveChatwootId(input.messageId);
  if (!origin) throw new PublicWebChatError('ORIGIN_NOT_ALLOWED');
  if (attachmentId === null || messageId === null) throw new PublicWebChatError('MESSAGE_INVALID');

  const service = createSupabaseServiceClient();
  const session = await service
    .from('web_chat_sessions')
    .select('id,organization_id,tenant_business_id,branch_id,communication_channel_binding_id,widget_config_id,conversation_id,origin,status,expires_at')
    .eq('id', input.sessionId)
    .eq('token_hash', hashWebChatToken(input.sessionToken))
    .maybeSingle();
  if (session.error || !session.data) throw new PublicWebChatError('SESSION_UNAVAILABLE');
  if (
    session.data.status !== 'ACTIVE'
    || session.data.origin !== origin
    || new Date(String(session.data.expires_at)).getTime() <= Date.now()
    || !session.data.conversation_id
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

  const projection = await service
    .from('unified_inbox_conversation_projections')
    .select('id,brand_id,tenant_business_id,branch_id,department_id,team_id,communication_channel_binding_id,chatwoot_inbox_mapping_id,chatwoot_conversation_display_id,lifecycle_status')
    .eq('organization_id', session.data.organization_id)
    .eq('tenant_business_id', session.data.tenant_business_id)
    .eq('branch_id', session.data.branch_id)
    .eq('communication_channel_binding_id', session.data.communication_channel_binding_id)
    .eq('conversation_id', session.data.conversation_id)
    .in('lifecycle_status', ['ACTIVE', 'DEGRADED'])
    .maybeSingle();
  if (projection.error || !projection.data) throw new PublicWebChatError('ATTACHMENT_UNAVAILABLE');

  const inbox = await service
    .from('chatwoot_inbox_mappings')
    .select('id,chatwoot_account_mapping_id,status')
    .eq('organization_id', session.data.organization_id)
    .eq('tenant_business_id', session.data.tenant_business_id)
    .eq('id', projection.data.chatwoot_inbox_mapping_id)
    .eq('communication_channel_binding_id', session.data.communication_channel_binding_id)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (inbox.error || !inbox.data) throw new PublicWebChatError('ATTACHMENT_UNAVAILABLE');

  const account = await service
    .from('chatwoot_account_mappings')
    .select('id,chatwoot_account_id,status')
    .eq('organization_id', session.data.organization_id)
    .eq('tenant_business_id', session.data.tenant_business_id)
    .eq('id', inbox.data.chatwoot_account_mapping_id)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  const accountId = positiveChatwootId(account.data?.chatwoot_account_id);
  if (account.error || !account.data || accountId === null) {
    throw new PublicWebChatError('ATTACHMENT_UNAVAILABLE');
  }

  const canonical = await service
    .from('conversation_messages')
    .select('id,metadata')
    .eq('organization_id', session.data.organization_id)
    .eq('conversation_id', session.data.conversation_id)
    .eq('channel', 'WEB_CHAT')
    .eq('direction', 'OUTBOUND')
    .eq('provider_message_id', `chatwoot:${messageId}`)
    .maybeSingle();
  const canonicalMetadata = webChatObject(canonical.data?.metadata);
  if (
    canonical.error
    || !canonical.data
    || canonicalMetadata?.source !== 'CHATWOOT_SIGNED_WEBHOOK'
    || typeof canonicalMetadata.chatwoot_event_id !== 'string'
  ) {
    throw new PublicWebChatError('ATTACHMENT_UNAVAILABLE');
  }

  const projectedAttachment = (Array.isArray(canonicalMetadata.attachments)
    ? canonicalMetadata.attachments
    : [])
    .map(webChatObject)
    .find((value) => (
      value
      && positiveChatwootId(value.id) === attachmentId
      && positiveChatwootId(value.messageId) === messageId
      && positiveChatwootId(value.accountId) === accountId
    ));
  if (!projectedAttachment) throw new PublicWebChatError('ATTACHMENT_UNAVAILABLE');
  const projectedSize = Number(projectedAttachment.size);
  if (Number.isFinite(projectedSize) && projectedSize > MAX_PUBLIC_ATTACHMENT_BYTES) {
    throw new PublicWebChatError('ATTACHMENT_UNAVAILABLE');
  }

  const journal = await service
    .from('chatwoot_webhook_events')
    .select('id,payload,status,event_type')
    .eq('id', canonicalMetadata.chatwoot_event_id)
    .eq('organization_id', session.data.organization_id)
    .eq('tenant_business_id', session.data.tenant_business_id)
    .eq('chatwoot_inbox_mapping_id', projection.data.chatwoot_inbox_mapping_id)
    .eq('event_type', 'message_created')
    .eq('status', 'PROCESSED')
    .maybeSingle();
  const payload = webChatObject(journal.data?.payload);
  const payloadConversation = webChatObject(payload?.conversation);
  if (
    journal.error
    || !journal.data
    || !payload
    || String(payload.message_type ?? '').toLowerCase() !== 'outgoing'
    || payload.private === true
    || positiveChatwootId(payload.id) !== messageId
    || positiveChatwootId(payloadConversation?.id) !== Number(projection.data.chatwoot_conversation_display_id)
  ) {
    throw new PublicWebChatError('ATTACHMENT_UNAVAILABLE');
  }

  const rawAttachment = (Array.isArray(payload.attachments) ? payload.attachments : [])
    .map(webChatObject)
    .find((value) => (
      value
      && positiveChatwootId(value.id) === attachmentId
      && positiveChatwootId(value.message_id) === messageId
      && positiveChatwootId(value.account_id) === accountId
    ));
  if (!rawAttachment || !isSafeChatwootAttachmentUrl(rawAttachment.data_url)) {
    throw new PublicWebChatError('ATTACHMENT_UNAVAILABLE');
  }

  const rawSize = Number(rawAttachment.file_size);
  if (Number.isFinite(rawSize) && rawSize > MAX_PUBLIC_ATTACHMENT_BYTES) {
    throw new PublicWebChatError('ATTACHMENT_UNAVAILABLE');
  }
  const sourceUrl = new URL(String(rawAttachment.data_url), String(process.env.CHATWOOT_BASE_URL));
  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetchImpl(sourceUrl.toString(), {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: '*/*' },
    });
    if (!response.ok || !response.body) throw new PublicWebChatError('SERVICE_UNAVAILABLE');

    const rawLength = response.headers.get('content-length');
    const contentLength = rawLength ? Number(rawLength) : Number.NaN;
    if (Number.isFinite(contentLength) && contentLength > MAX_PUBLIC_ATTACHMENT_BYTES) {
      await response.body.cancel();
      throw new PublicWebChatError('ATTACHMENT_UNAVAILABLE');
    }

    const declaredType = typeof rawAttachment.content_type === 'string'
      ? rawAttachment.content_type.trim().toLowerCase().slice(0, 120)
      : '';
    const upstreamType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
    const contentType = declaredType && declaredType === upstreamType
      ? declaredType
      : SAFE_INLINE_ATTACHMENT_TYPES.has(declaredType) && !upstreamType
        ? declaredType
        : 'application/octet-stream';
    const extension = safeAttachmentExtension(rawAttachment.extension);
    const filename = `attachment-${attachmentId}${extension ? `.${extension}` : ''}`;

    const audit = await service.from('audit_logs').insert({
      organization_id: session.data.organization_id,
      actor_type: 'PUBLIC_SESSION',
      actor_id: session.data.id,
      action: 'WEB_CHAT_ATTACHMENT_DOWNLOAD_AUTHORIZED',
      entity_type: 'web_chat_session',
      entity_id: session.data.id,
      brand_id: projection.data.brand_id,
      tenant_business_id: projection.data.tenant_business_id,
      branch_id: projection.data.branch_id,
      department_id: projection.data.department_id,
      team_id: projection.data.team_id,
      correlation_id: globalThis.crypto.randomUUID(),
      after_data: {
        canonical_message_id: canonical.data.id,
        chatwoot_event_id: journal.data.id,
        chatwoot_message_id: messageId,
        attachment_id: attachmentId,
        chatwoot_account_id_verified: true,
        conversation_scope_verified: true,
        session_scope_verified: true,
        direct_storage_url_exposed: false,
      },
    });
    if (audit.error) {
      await response.body.cancel();
      throw new PublicWebChatError('SERVICE_UNAVAILABLE');
    }

    return {
      body: boundedPublicAttachmentStream(response.body),
      contentType,
      contentLength: Number.isFinite(contentLength) && contentLength >= 0
        ? contentLength
        : Number.isFinite(rawSize) && rawSize >= 0 ? rawSize : null,
      filename,
      inline: SAFE_INLINE_ATTACHMENT_TYPES.has(contentType),
    };
  } catch (error) {
    if (error instanceof PublicWebChatError) throw error;
    throw new PublicWebChatError('SERVICE_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}


export async function closePublicWebChatSession(input:{
  publicKey:string;
  origin:string;
  sessionId:string;
  sessionToken:string;
}){
  const origin=normalizeOrigin(input.origin);
  if(!origin) throw new PublicWebChatError('ORIGIN_NOT_ALLOWED');
  const service=createSupabaseServiceClient();
  const {data,error}=await service.rpc('close_web_chat_session',{
    p_widget_public_key:input.publicKey,
    p_session_id:input.sessionId,
    p_token_hash:hashWebChatToken(input.sessionToken),
    p_origin:origin,
  });
  if(error) throw mapRpcError(error.message);
  const row=Array.isArray(data)?data[0]:data;
  if(!row||typeof row.session_status!=='string') throw new PublicWebChatError('SERVICE_UNAVAILABLE');
  return {closed:Boolean(row.closed),status:String(row.session_status)};
}
