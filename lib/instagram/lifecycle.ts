import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetaInstagramRoute } from './tenant-routing';
import type { NormalizedInstagramEvent } from './webhook';
import { ensureChatwootPublicConversationProjection } from '@/lib/chatwoot/public-conversation-projection';

export type InstagramBusinessResolution =
  | { status: 'NO_MATCH' }
  | { status: 'MATCH'; businessId: string; identityId: string };

export async function resolveInstagramInboundBusiness(input: {
  service: SupabaseClient;
  route: MetaInstagramRoute;
  event: NormalizedInstagramEvent;
}): Promise<InstagramBusinessResolution> {
  if (!input.event.senderId) return { status: 'NO_MATCH' };
  const { data, error } = await input.service.rpc('resolve_instagram_provider_business', {
    p_organization_id: input.route.organizationId,
    p_binding_id: input.route.bindingId,
    p_provider_user_id: input.event.senderId,
  });
  if (error) throw new Error(`Instagram canonical identity resolution failed: ${error.message}`);
  if (!Array.isArray(data) || data.length === 0) return { status: 'NO_MATCH' };
  if (data.length !== 1) throw new Error('Instagram canonical identity resolution was not unique');
  return {
    status: 'MATCH',
    businessId: String(data[0].business_id),
    identityId: String(data[0].identity_id),
  };
}


function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function inboundMediaType(event: NormalizedInstagramEvent) {
  const attachments = Array.isArray(event.payload.attachments) ? event.payload.attachments : [];
  const first = attachments[0];
  const type = first && typeof first === 'object' && !Array.isArray(first)
    ? String((first as Record<string, unknown>).type ?? '').toLowerCase()
    : '';
  if (type === 'image') return 'IMAGE';
  if (type === 'video') return 'VIDEO';
  if (type === 'audio') return 'AUDIO';
  if (type === 'file') return 'DOCUMENT';
  return attachments.length ? 'OTHER' : 'TEXT';
}

export async function projectMatchedInstagramInbound(input: {
  service: SupabaseClient;
  route: MetaInstagramRoute;
  event: NormalizedInstagramEvent;
  identity: Extract<InstagramBusinessResolution, { status: 'MATCH' }>;
}) {
  if (input.event.eventType !== 'MESSAGE' || input.event.payload.isEcho === true) {
    return { projected: false as const, reason: 'NOT_CUSTOMER_MESSAGE' as const };
  }
  const providerMessageId = stringValue(input.event.payload.messageId);
  if (!providerMessageId) {
    throw new Error('Instagram inbound message is missing provider message id');
  }

  const external = await ensureChatwootPublicConversationProjection({
    service: input.service,
    organizationId: input.route.organizationId,
    tenantBusinessId: input.route.tenantBusinessId,
    bindingId: input.route.bindingId,
    canonicalIdentityId: input.identity.identityId,
  });
  const displayId = Number(external.conversation.id);
  const contactId = Number(external.contact.id);
  if (!Number.isInteger(displayId) || displayId <= 0 || !Number.isSafeInteger(contactId) || contactId <= 0) {
    throw new Error('Chatwoot projection returned invalid canonical identifiers');
  }

  const { data, error } = await input.service.rpc('project_instagram_inbound_message', {
    p_organization_id: input.route.organizationId,
    p_tenant_business_id: input.route.tenantBusinessId,
    p_branch_id: input.route.branchId,
    p_binding_id: input.route.bindingId,
    p_business_id: input.identity.businessId,
    p_identity_id: input.identity.identityId,
    p_provider_message_id: providerMessageId,
    p_message_text: stringValue(input.event.payload.text),
    p_media_type: inboundMediaType(input.event),
    p_chatwoot_conversation_display_id: displayId,
    p_chatwoot_conversation_uuid: stringValue(external.conversation.uuid),
    p_chatwoot_contact_id: contactId,
    p_occurred_at: input.event.occurredAt ?? null,
    p_request_key: `instagram:${providerMessageId}`.slice(0, 200),
  });
  if (error) throw new Error(`Instagram inbound CRM projection failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.conversation_id || !row?.message_id || !row?.projection_id) {
    throw new Error('Instagram inbound CRM projection returned invalid result');
  }
  return {
    projected: true as const,
    leadId: String(row.lead_id),
    conversationId: String(row.conversation_id),
    messageId: String(row.message_id),
    projectionId: String(row.projection_id),
    messageInserted: Boolean(row.message_inserted),
    chatwootOutcome: external.outcome,
  };
}
