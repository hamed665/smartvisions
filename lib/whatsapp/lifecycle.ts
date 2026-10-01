import { createClient } from '@supabase/supabase-js';
import { isDoNotContactReply, persistCustomerDoNotContact, persistCustomerReplyConversationState } from '@/lib/conversations/sales-lifecycle';
import type { NormalizedWhatsAppInbound, NormalizedWhatsAppStatus } from './webhook';
import { mapWhatsAppProviderStatus } from '@/lib/omnichannel';
import {
  recordCrmBusinessIdentityEvidence,
  resolveBusinessByCrmIdentityCandidates,
} from '@/lib/crm/contact-identity';

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

type GccInboundRule = {
  market: 'OM' | 'AE' | 'SA' | 'QA';
  prefix: string;
  lengths: readonly number[];
};

const GCC_INBOUND_PREFIXES: readonly GccInboundRule[] = [
  { market: 'OM', prefix: '968', lengths: [11] },
  { market: 'AE', prefix: '971', lengths: [11, 12] },
  { market: 'SA', prefix: '966', lengths: [12] },
  { market: 'QA', prefix: '974', lengths: [11] },
];

export function verifiedInboundMarketForPhone(value?: string | null) {
  const digits = normalizePhoneDigits(value);
  const match = GCC_INBOUND_PREFIXES.find(rule => digits.startsWith(rule.prefix) && rule.lengths.includes(digits.length));
  return match?.market ?? null;
}

export function buildVerifiedInboundBusinessSeed(event: Pick<NormalizedWhatsAppInbound, 'from' | 'contactName'>) {
  const digits = normalizePhoneDigits(event.from);
  const countryCode = verifiedInboundMarketForPhone(digits);
  if (!countryCode) return null;
  const contactName = String(event.contactName ?? '').trim().replace(/\s+/g, ' ').slice(0, 180);
  return {
    name: contactName || 'WhatsApp inbound contact',
    countryCode,
    whatsapp: `+${digits}`,
    dedupeDomain: `wa-${digits}.whatsapp-inbound.invalid`,
  };
}

export function inboundAcquisitionMetadata(event: Pick<NormalizedWhatsAppInbound, 'providerMessageId' | 'referral'>) {
  const referral = event.referral;
  if (!referral) {
    return {
      acquisition_source: 'CUSTOMER_WHATSAPP_MESSAGE' as const,
      customer_initiated: true,
      provider_message_id: event.providerMessageId,
    };
  }
  return {
    acquisition_source: 'CLICK_TO_WHATSAPP' as const,
    customer_initiated: true,
    provider_message_id: event.providerMessageId,
    referral: {
      source_url: referral.sourceUrl ?? null,
      source_id: referral.sourceId ?? null,
      source_type: referral.sourceType ?? null,
      headline: referral.headline ?? null,
      body: referral.body ?? null,
      media_type: referral.mediaType ?? null,
      ctwa_clid: referral.ctwaClid ?? null,
    },
  };
}

export function isWhatsAppInboundDuplicateError(code?: string | null) {
  return code === '23505';
}

export function mapWhatsAppDeliveryStatus(status: NormalizedWhatsAppStatus['status']) {
  return mapWhatsAppProviderStatus(status);
}

async function resolveExactBusinessByPhone(organizationId: string, from: string) {
  const supabase = serviceClient();
  const target = normalizePhoneDigits(from);
  if (target.length < 8) return { business: null, ambiguous: false };

  const registry = await resolveBusinessByCrmIdentityCandidates({
    supabase,
    organizationId,
    candidates: [
      { identityType: 'WHATSAPP', value: from },
      { identityType: 'PHONE', value: from },
    ],
  });
  if (registry.status === 'AMBIGUOUS') return { business: null, ambiguous: true };
  if (registry.status === 'MATCH') {
    const { data: business, error } = await supabase
      .from('businesses')
      .select('id,phone,international_phone,whatsapp')
      .eq('organization_id', organizationId)
      .eq('id', registry.businessId)
      .maybeSingle();
    if (error) throw new Error(`WhatsApp identity Business lookup failed: ${error.message}`);
    if (business) return { business, ambiguous: false };
  }

  const suffix = target.slice(-8);
  const { data: businesses, error: businessError } = await supabase
    .from('businesses')
    .select('id,phone,international_phone,whatsapp')
    .eq('organization_id', organizationId)
    .or(`phone.ilike.%${suffix}%,international_phone.ilike.%${suffix}%,whatsapp.ilike.%${suffix}%`)
    .limit(20);
  if (businessError) throw new Error(`WhatsApp business lookup failed: ${businessError.message}`);

  const exact = (businesses ?? []).filter(row =>
    phonesRepresentSameNumber(target, row.phone)
      || phonesRepresentSameNumber(target, row.international_phone)
      || phonesRepresentSameNumber(target, row.whatsapp),
  );
  if (exact.length > 1) return { business: null, ambiguous: true };
  return { business: exact[0] ?? null, ambiguous: false };
}

async function getOrCreateLeadForBusiness(organizationId: string, businessId: string) {
  const supabase = serviceClient();
  const { data: existing, error: existingError } = await supabase
    .from('leads')
    .select('id,status,agent_mode,business_id')
    .eq('organization_id', organizationId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (existingError) throw new Error(`WhatsApp lead lookup failed: ${existingError.message}`);
  if (existing) return existing;

  const { data: created, error: createError } = await supabase.from('leads').insert({
    organization_id: organizationId,
    business_id: businessId,
    status: 'NEW',
    agent_mode: 'AUTO',
    opportunity_score: 0,
    intent_score: 0,
    score_reasons: ['Verified customer-initiated WhatsApp inbound'],
  }).select('id,status,agent_mode,business_id').single();
  if (!createError) return created;
  if (!isWhatsAppInboundDuplicateError(createError.code)) {
    throw new Error(`WhatsApp inbound lead create failed: ${createError.message}`);
  }

  const { data: raced, error: racedError } = await supabase
    .from('leads')
    .select('id,status,agent_mode,business_id')
    .eq('organization_id', organizationId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (racedError || !raced) throw new Error(`WhatsApp inbound lead race recovery failed: ${racedError?.message ?? 'lead unavailable'}`);
  return raced;
}

async function resolveOrCreateVerifiedInboundLead(organizationId: string, event: NormalizedWhatsAppInbound) {
  const supabase = serviceClient();
  const resolved = await resolveExactBusinessByPhone(organizationId, event.from);
  if (resolved.ambiguous) return null;
  if (resolved.business) {
    const businessId = String(resolved.business.id);
    const identity = await recordCrmBusinessIdentityEvidence({
      supabase,
      organizationId,
      businessId,
      identityType: 'WHATSAPP',
      value: event.from,
      displayValue: event.from,
      sourceType: 'WHATSAPP_INBOUND',
      sourceRef: 'whatsapp-inbound',
      evidenceStrength: 'VERIFIED',
      evidence: { provider_message_id: event.providerMessageId },
    });
    const lead = await getOrCreateLeadForBusiness(organizationId, businessId);
    const identityId = typeof identity?.resolved_identity_id === 'string'
      ? identity.resolved_identity_id
      : null;
    return { lead, businessId, identityId };
  }

  const seed = buildVerifiedInboundBusinessSeed(event);
  if (!seed) return null;

  const { data: existingPlaceholder, error: placeholderError } = await supabase
    .from('businesses')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('dedupe_domain', seed.dedupeDomain)
    .maybeSingle();
  if (placeholderError) throw new Error(`WhatsApp inbound placeholder lookup failed: ${placeholderError.message}`);

  let businessId = existingPlaceholder?.id ? String(existingPlaceholder.id) : null;
  if (!businessId) {
    const { data: created, error: createError } = await supabase.from('businesses').insert({
      organization_id: organizationId,
      name: seed.name,
      country_code: seed.countryCode,
      whatsapp: seed.whatsapp,
      dedupe_domain: seed.dedupeDomain,
    }).select('id').single();
    if (!createError) {
      businessId = String(created.id);
    } else if (isWhatsAppInboundDuplicateError(createError.code)) {
      const { data: raced, error: racedError } = await supabase
        .from('businesses')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('dedupe_domain', seed.dedupeDomain)
        .maybeSingle();
      if (racedError || !raced) throw new Error(`WhatsApp inbound business race recovery failed: ${racedError?.message ?? 'business unavailable'}`);
      businessId = String(raced.id);
    } else {
      throw new Error(`WhatsApp inbound business create failed: ${createError.message}`);
    }
  }

  const identity = await recordCrmBusinessIdentityEvidence({
    supabase,
    organizationId,
    businessId,
    identityType: 'WHATSAPP',
    value: event.from,
    displayValue: event.from,
    sourceType: 'WHATSAPP_INBOUND',
    sourceRef: 'whatsapp-inbound',
    evidenceStrength: 'VERIFIED',
    evidence: { provider_message_id: event.providerMessageId },
  });

  const lead = await getOrCreateLeadForBusiness(organizationId, businessId);
  const identityId = typeof identity?.resolved_identity_id === 'string'
    ? identity.resolved_identity_id
    : null;
  return { lead, businessId, identityId };
}

type WhatsAppTenantScope = {
  tenantBusinessId: string;
  branchId: string | null;
  bindingId: string;
  integrationConnectionId?: string | null;
  phoneNumberId?: string | null;
  wabaId?: string | null;
};

async function getOrCreateConversation(organizationId: string, leadId: string, receivedAt: string, scope: WhatsAppTenantScope) {
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
    const { data: projection, error: projectionError } = await supabase
      .from('unified_inbox_conversation_projections')
      .select('tenant_business_id,branch_id,communication_channel_binding_id,lifecycle_status')
      .eq('organization_id', organizationId)
      .eq('conversation_id', existing.id)
      .in('lifecycle_status', ['ACTIVE', 'DEGRADED'])
      .maybeSingle();
    if (projectionError) throw new Error(`WhatsApp conversation scope lookup failed: ${projectionError.message}`);
    const sameScope = projection
      && projection.tenant_business_id === scope.tenantBusinessId
      && (projection.branch_id ?? null) === scope.branchId
      && projection.communication_channel_binding_id === scope.bindingId;
    if (sameScope) {
      const { error } = await supabase.from('sales_conversations').update({ last_message_at: receivedAt, updated_at: new Date().toISOString() }).eq('id', existing.id).eq('organization_id', organizationId);
      if (error) throw new Error(`WhatsApp conversation update failed: ${error.message}`);
      return existing;
    }
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

export async function applyWhatsAppInboundLifecycle(organizationId: string, event: NormalizedWhatsAppInbound, scope: WhatsAppTenantScope) {
  const supabase = serviceClient();
  const resolved = await resolveOrCreateVerifiedInboundLead(organizationId, event);
  if (!resolved) return { linked: false as const };
  const { lead, businessId, identityId } = resolved;

  const receivedAt = event.timestamp ? new Date(Number(event.timestamp) * 1000).toISOString() : new Date().toISOString();
  const conversation = await getOrCreateConversation(organizationId, lead.id, receivedAt, scope);
  const body = event.text?.trim() || event.caption?.trim() || (event.type === 'audio' ? '[WhatsApp voice message]' : `[WhatsApp ${event.type} message]`);
  const idempotencyKey = `whatsapp:inbound:${event.providerMessageId}`;
  const acquisition = inboundAcquisitionMetadata(event);

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
    metadata: {
      conversation_id: conversation.id,
      type: event.type,
      media_id: event.mediaId ?? null,
      mime_type: event.mimeType ?? null,
      filename: event.filename ?? null,
      caption: event.caption ?? null,
      voice: Boolean(event.voice),
      tenant_business_id: scope.tenantBusinessId,
      branch_id: scope.branchId,
      communication_channel_binding_id: scope.bindingId,
      ...acquisition,
    },
  });
  if (messageError && !isWhatsAppInboundDuplicateError(messageError.code)) {
    throw new Error(`WhatsApp inbound message persistence failed: ${messageError.message}`);
  }

  const mediaType = event.type === 'audio'
    ? event.voice ? 'VOICE' : 'AUDIO'
    : event.type === 'image'
      ? 'IMAGE'
      : event.type === 'video'
        ? 'VIDEO'
        : event.type === 'document'
          ? 'DOCUMENT'
          : event.type === 'text'
            ? 'TEXT'
            : 'OTHER';

  const canonicalMessage = await supabase.from('conversation_messages').insert({
    organization_id: organizationId,
    conversation_id: conversation.id,
    lead_id: lead.id,
    provider_message_id: event.providerMessageId,
    channel: 'WHATSAPP',
    direction: 'INBOUND',
    media_type: mediaType,
    original_text: body,
    status: 'RECEIVED',
    provenance: 'CUSTOMER',
    source_plane: 'META_WHATSAPP',
    source_message_id: event.providerMessageId,
    metadata: {
      source: 'META_WHATSAPP_WEBHOOK',
      from: event.from,
      contact_name: event.contactName ?? null,
      type: event.type,
      media_id: event.mediaId ?? null,
      mime_type: event.mimeType ?? null,
      filename: event.filename ?? null,
      caption: event.caption ?? null,
      voice: Boolean(event.voice),
      tenant_business_id: scope.tenantBusinessId,
      branch_id: scope.branchId,
      communication_channel_binding_id: scope.bindingId,
      canonical_business_id: businessId,
      canonical_identity_id: identityId,
      ...acquisition,
    },
    created_at: receivedAt,
    processed_at: receivedAt,
  }).select('id,conversation_id,provenance').single();

  let canonicalMessageId: string;
  if (canonicalMessage.error) {
    if (!isWhatsAppInboundDuplicateError(canonicalMessage.error.code)) {
      throw new Error(`WhatsApp canonical inbound message persistence failed: ${canonicalMessage.error.message}`);
    }
    const replay = await supabase.from('conversation_messages')
      .select('id,conversation_id,provenance')
      .eq('organization_id', organizationId)
      .eq('channel', 'WHATSAPP')
      .eq('provider_message_id', event.providerMessageId)
      .maybeSingle();
    if (
      replay.error
      || !replay.data
      || replay.data.conversation_id !== conversation.id
      || replay.data.provenance !== 'CUSTOMER'
    ) {
      throw new Error('WhatsApp canonical inbound replay does not match its original conversation');
    }
    canonicalMessageId = String(replay.data.id);
  } else {
    canonicalMessageId = String(canonicalMessage.data.id);
  }

  const { error: eventLinkError } = await supabase.from('whatsapp_events').update({
    lead_id: lead.id,
    conversation_id: conversation.id,
    payload: {
      ...event,
      routing: {
        tenantBusinessId: scope.tenantBusinessId,
        branchId: scope.branchId,
        bindingId: scope.bindingId,
        integrationConnectionId: scope.integrationConnectionId ?? null,
        phoneNumberId: scope.phoneNumberId ?? event.destination.phoneNumberId ?? null,
        wabaId: scope.wabaId ?? event.destination.wabaId ?? null,
      },
      canonical: {
        businessId,
        identityId,
        messageId: canonicalMessageId,
      },
    },
  }).eq('organization_id', organizationId)
    .eq('provider_message_id', event.providerMessageId)
    .eq('direction', 'INBOUND')
    .eq('event_type', event.type.toUpperCase());
  if (eventLinkError) throw new Error(`WhatsApp event linkage failed: ${eventLinkError.message}`);

  if (isDoNotContactReply(body)) {
    await persistCustomerDoNotContact({
      supabase,
      organizationId,
      leadId: lead.id,
      conversationId: conversation.id,
      phone: event.from,
      source: 'WHATSAPP_INBOUND',
    });
    return {
      linked: true as const,
      leadId: lead.id,
      businessId,
      identityId,
      conversationId: conversation.id,
      messageId: canonicalMessageId,
      agentMode: 'PAUSED' as const,
      doNotContact: true as const,
      acquisitionSource: acquisition.acquisition_source,
    };
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

  return {
    linked: true as const,
    leadId: lead.id,
    businessId,
    identityId,
    conversationId: conversation.id,
    messageId: canonicalMessageId,
    agentMode: lead.agent_mode,
    acquisitionSource: acquisition.acquisition_source,
  };
}

export async function applyWhatsAppStatusLifecycle(organizationId: string, event: NormalizedWhatsAppStatus, scope: WhatsAppTenantScope) {
  const supabase = serviceClient();
  const occurredAt = event.timestamp && /^\d+$/.test(event.timestamp)
    ? new Date(Number(event.timestamp) * 1000).toISOString()
    : new Date().toISOString();
  const { data, error } = await supabase.rpc('reconcile_whatsapp_delivery_status', {
    p_organization_id: organizationId,
    p_provider_message_id: event.providerMessageId,
    p_status: event.status,
    p_occurred_at: occurredAt,
    p_tenant_business_id: scope.tenantBusinessId,
    p_branch_id: scope.branchId,
    p_binding_id: scope.bindingId,
    p_conversation_id: event.conversationId ?? null,
    p_pricing_category: event.pricingCategory ?? null,
    p_error_code: event.errorCode ?? null,
    p_error_title: event.errorTitle ?? null,
  });
  if (error) throw new Error(`WhatsApp delivery status reconciliation failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return {
    matched: Number(row?.outreach_matched ?? 0) + Number(row?.conversation_matched ?? 0),
    status: row?.canonical_status ? String(row.canonical_status) : mapWhatsAppDeliveryStatus(event.status),
  };
}


export async function replayPersistedWhatsAppStatuses(input: {
  organizationId: string;
  providerMessageId: string;
  tenantBusinessId: string;
  branchId: string | null;
  bindingId: string;
}) {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('whatsapp_events')
    .select('payload,created_at')
    .eq('organization_id', input.organizationId)
    .eq('provider_message_id', input.providerMessageId)
    .eq('direction', 'STATUS')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(`WhatsApp status replay discovery failed: ${error.message}`);

  let matched = 0;
  for (const row of data ?? []) {
    const payload = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? row.payload as Record<string, unknown>
      : null;
    const status = typeof payload?.status === 'string' ? payload.status : '';
    if (!['sent','delivered','read','failed','deleted','unknown'].includes(status)) continue;

    const event: NormalizedWhatsAppStatus = {
      providerMessageId: input.providerMessageId,
      destination: {
        phoneNumberId: typeof (payload?.destination as Record<string, unknown> | undefined)?.phoneNumberId === 'string'
          ? String((payload!.destination as Record<string, unknown>).phoneNumberId)
          : undefined,
        displayPhoneNumber: typeof (payload?.destination as Record<string, unknown> | undefined)?.displayPhoneNumber === 'string'
          ? String((payload!.destination as Record<string, unknown>).displayPhoneNumber)
          : undefined,
        wabaId: typeof (payload?.destination as Record<string, unknown> | undefined)?.wabaId === 'string'
          ? String((payload!.destination as Record<string, unknown>).wabaId)
          : undefined,
      },
      status: status as NormalizedWhatsAppStatus['status'],
      timestamp: typeof payload?.timestamp === 'string' ? payload.timestamp : undefined,
      recipientId: typeof payload?.recipientId === 'string' ? payload.recipientId : undefined,
      conversationId: typeof payload?.conversationId === 'string' ? payload.conversationId : undefined,
      pricingCategory: typeof payload?.pricingCategory === 'string' ? payload.pricingCategory : undefined,
      errorCode: typeof payload?.errorCode === 'string' ? payload.errorCode : undefined,
      errorTitle: typeof payload?.errorTitle === 'string' ? payload.errorTitle : undefined,
    };

    const result = await applyWhatsAppStatusLifecycle(input.organizationId, event, {
      tenantBusinessId: input.tenantBusinessId,
      branchId: input.branchId,
      bindingId: input.bindingId,
    });
    matched += result.matched;
  }

  return { replayed: data?.length ?? 0, matched };
}
