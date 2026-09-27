import 'server-only';

import { getMessengerActivationReadiness } from '@/lib/facebook-messenger/activation';
import { getInstagramActivationReadiness } from '@/lib/instagram/activation';
import { EMAIL_CHANNEL_DESCRIPTOR, WHATSAPP_CHANNEL_DESCRIPTOR } from '@/lib/omnichannel/adapters';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getWebChatConnectionHealth } from '@/lib/web-chat/health';

export type CustomerChannel =
  | 'EMAIL'
  | 'WHATSAPP'
  | 'INSTAGRAM'
  | 'FACEBOOK_MESSENGER'
  | 'WEB_CHAT'
  | 'TELEGRAM'
  | 'TIKTOK'
  | 'SMS_RCS'
  | 'VOICE';

export type ChannelHealthSnapshot = {
  channel: CustomerChannel;
  provider: string;
  implementationState:
    | 'ACTIVE'
    | 'INTERNAL_READY'
    | 'PARTIAL'
    | 'NOT_CONFIGURED'
    | 'NOT_IMPLEMENTED';
  connectionStatus: string;
  credentialHealth: string;
  webhookHealth: string;
  quotaHealth: string;
  lastVerifiedAt: string | null;
  supportedCapabilities: string[];
  incidentState: string;
  blockers: string[];
  bindingCount: number;
  lastEventAt: string | null;
  lastAcceptanceAt: string | null;
  controlState: string;
  evidenceSources: string[];
};

type IntegrationRow = {
  id: string;
  provider: string;
  channel: string;
  enabled: boolean;
  status: string;
  last_checked_at: string | null;
  last_error: string | null;
};

type BindingRow = {
  id: string;
  channel: string;
  tenant_business_id: string;
  branch_id: string | null;
  status: string;
  last_verified_at: string | null;
  last_error_code: string | null;
  provider_destination_id: string | null;
  provider_secret_ref: string | null;
};

function maxIso(...values: Array<string | null | undefined>) {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isFinite(ms) && ms > bestMs) {
      best = value;
      bestMs = ms;
    }
  }
  return best;
}

function descriptorCapabilities(descriptor: typeof EMAIL_CHANNEL_DESCRIPTOR | typeof WHATSAPP_CHANNEL_DESCRIPTOR) {
  const supports = descriptor.supports;
  return [
    supports.inbound ? 'INBOUND' : null,
    supports.text ? 'TEXT' : null,
    supports.html ? 'HTML' : null,
    supports.subject ? 'SUBJECT' : null,
    supports.templates ? 'TEMPLATES' : null,
    supports.catalogProduct ? 'CATALOG_PRODUCT' : null,
    supports.deliveryReceipts ? 'DELIVERY_RECEIPTS' : null,
    supports.readReceipts ? 'READ_RECEIPTS' : null,
    supports.providerThreadIdentity ? 'PROVIDER_THREAD_IDENTITY' : null,
    'CANONICAL_SEND_GATE',
    'DNC_SUPPRESSION',
    'HUMAN_TAKEOVER',
  ].filter((value): value is string => Boolean(value));
}

function envCredentialHealth(channel: 'EMAIL' | 'WHATSAPP') {
  if (channel === 'EMAIL') {
    return process.env.EMAIL_PROVIDER?.trim() && process.env.EMAIL_PROVIDER_API_KEY?.trim()
      ? 'PRESENT'
      : 'MISSING';
  }
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN?.trim()
    || process.env.META_WHATSAPP_TOKEN?.trim()
    || process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim()
    || process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  return token && phoneId ? 'PRESENT' : 'MISSING';
}

async function latestEvent(
  table: 'email_events' | 'whatsapp_events' | 'instagram_events' | 'facebook_messenger_events',
  organizationId: string,
) {
  const service = createSupabaseServiceClient();
  const result = await service
    .from(table)
    .select('created_at,event_type')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(`${table} health lookup failed`);
  return result.data
    ? { createdAt: String(result.data.created_at), eventType: String(result.data.event_type ?? 'UNKNOWN') }
    : null;
}

async function latestAcceptance(
  table:
    | 'instagram_activation_acceptance_receipts'
    | 'facebook_messenger_activation_acceptance_receipts'
    | 'web_chat_activation_acceptance_receipts',
  organizationId: string,
) {
  const service = createSupabaseServiceClient();
  const result = await service
    .from(table)
    .select('observed_at')
    .eq('organization_id', organizationId)
    .order('observed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(`${table} health lookup failed`);
  return result.data?.observed_at ? String(result.data.observed_at) : null;
}

function integrationState(row: IntegrationRow | undefined, credentialHealth: string) {
  if (!row) return { connectionStatus: 'ROW_MISSING', incidentState: 'NOT_CONFIGURED' };
  if (row.last_error) return { connectionStatus: row.status, incidentState: 'DEGRADED' };
  if (!row.enabled || row.status === 'NOT_CONFIGURED') {
    return { connectionStatus: 'NOT_CONFIGURED', incidentState: 'NOT_CONFIGURED' };
  }
  if (credentialHealth === 'MISSING') {
    return { connectionStatus: row.status, incidentState: 'CREDENTIAL_MISSING' };
  }
  return { connectionStatus: row.status, incidentState: 'CLEAR' };
}

function pauseState(controls: Record<string, unknown> | null, channel: CustomerChannel) {
  if (!controls) return 'CONTROL_STATE_MISSING';
  if (controls.global_kill_switch === true) return 'GLOBAL_KILL_SWITCH';
  if (channel === 'EMAIL' && controls.email_paused === true) return 'PAUSED';
  if (channel === 'WHATSAPP' && controls.whatsapp_ai_paused === true) return 'AI_PAUSED';
  if (channel === 'INSTAGRAM' && controls.instagram_ai_paused === true) return 'AI_PAUSED';
  if (channel === 'FACEBOOK_MESSENGER' && controls.facebook_messenger_ai_paused === true) return 'AI_PAUSED';
  if (channel === 'WEB_CHAT' && controls.web_chat_ai_paused === true) return 'AI_PAUSED';
  return 'RUNNING';
}

export async function getOmnichannelHealth(organizationId: string): Promise<ChannelHealthSnapshot[]> {
  const service = createSupabaseServiceClient();

  const [
    integrationsResult,
    bindingsResult,
    controlsResult,
    emailEvent,
    whatsappEvent,
    instagramEvent,
    messengerEvent,
    instagramAcceptance,
    messengerAcceptance,
    webChatAcceptance,
    webChatHealth,
  ] = await Promise.all([
    service
      .from('integration_connections')
      .select('id,provider,channel,enabled,status,last_checked_at,last_error')
      .eq('organization_id', organizationId),
    service
      .from('communication_channel_bindings')
      .select('id,channel,tenant_business_id,branch_id,status,last_verified_at,last_error_code,provider_destination_id,provider_secret_ref')
      .eq('organization_id', organizationId)
      .in('channel', ['EMAIL', 'WHATSAPP', 'INSTAGRAM', 'FACEBOOK_MESSENGER', 'WEB_CHAT']),
    service
      .from('system_controls')
      .select('shadow_mode,global_kill_switch,email_paused,whatsapp_ai_paused,instagram_ai_paused,facebook_messenger_ai_paused,web_chat_ai_paused,agents_paused')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    latestEvent('email_events', organizationId),
    latestEvent('whatsapp_events', organizationId),
    latestEvent('instagram_events', organizationId),
    latestEvent('facebook_messenger_events', organizationId),
    latestAcceptance('instagram_activation_acceptance_receipts', organizationId),
    latestAcceptance('facebook_messenger_activation_acceptance_receipts', organizationId),
    latestAcceptance('web_chat_activation_acceptance_receipts', organizationId),
    getWebChatConnectionHealth(organizationId),
  ]);

  if (integrationsResult.error) throw new Error('Integration connection health lookup failed');
  if (bindingsResult.error) throw new Error('Channel binding health lookup failed');
  if (controlsResult.error) throw new Error('System control health lookup failed');

  const integrations = (integrationsResult.data ?? []) as IntegrationRow[];
  const bindings = (bindingsResult.data ?? []) as BindingRow[];
  const controls = controlsResult.data ? controlsResult.data as Record<string, unknown> : null;

  const integration = (provider: string, channel: string) =>
    integrations.find((row) => row.provider === provider && row.channel === channel);
  const channelBindings = (channel: CustomerChannel) =>
    bindings.filter((row) => row.channel === channel && row.status === 'ACTIVE');

  const emailIntegration = integration('EMAIL_PROVIDER', 'EMAIL');
  const emailCredential = envCredentialHealth('EMAIL');
  const emailState = integrationState(emailIntegration, emailCredential);

  const whatsappIntegration = integration('META', 'WHATSAPP');
  const whatsappCredential = envCredentialHealth('WHATSAPP');
  const whatsappState = integrationState(whatsappIntegration, whatsappCredential);

  const instagramBindings = channelBindings('INSTAGRAM');
  const instagramReadiness = await Promise.all(instagramBindings.map((binding) =>
    getInstagramActivationReadiness({
      service,
      organizationId,
      tenantBusinessId: binding.tenant_business_id,
      branchId: binding.branch_id,
    }),
  ));
  const instagramBlockers = [...new Set(instagramReadiness.flatMap((row) => row.blockers))];
  const instagramIntegration = integration('META', 'INSTAGRAM');

  const messengerBindings = channelBindings('FACEBOOK_MESSENGER');
  const messengerReadiness = await Promise.all(messengerBindings.map((binding) =>
    getMessengerActivationReadiness({
      service,
      organizationId,
      tenantBusinessId: binding.tenant_business_id,
      branchId: binding.branch_id,
    }),
  ));
  const messengerBlockers = [...new Set(messengerReadiness.flatMap((row) => row.blockers))];
  const messengerIntegration = integration('META', 'FACEBOOK_MESSENGER');

  const webChatBindingCount = webChatHealth.length;
  const webChatBlockers = [...new Set(webChatHealth.flatMap((row) => row.blockers))];
  const webChatLastEvent = maxIso(
    ...webChatHealth.map((row) => row.lastInboundAt),
    ...webChatHealth.map((row) => row.lastOutboundAt),
  );

  const snapshots: ChannelHealthSnapshot[] = [
    {
      channel: 'EMAIL',
      provider: 'EMAIL_PROVIDER',
      implementationState: emailIntegration?.enabled && emailIntegration.status === 'CONNECTED' ? 'ACTIVE' : 'NOT_CONFIGURED',
      connectionStatus: emailState.connectionStatus,
      credentialHealth: emailCredential,
      webhookHealth: emailEvent ? 'EVIDENCE_PRESENT' : 'NO_EVENT_EVIDENCE',
      quotaHealth: 'NO_PROVIDER_QUOTA_EVIDENCE',
      lastVerifiedAt: maxIso(emailIntegration?.last_checked_at, emailEvent?.createdAt),
      supportedCapabilities: descriptorCapabilities(EMAIL_CHANNEL_DESCRIPTOR),
      incidentState: pauseState(controls, 'EMAIL') !== 'RUNNING' ? pauseState(controls, 'EMAIL') : emailState.incidentState,
      blockers: [
        ...(emailCredential === 'MISSING' ? ['CREDENTIAL_MISSING'] : []),
        ...(emailIntegration?.last_error ? ['INTEGRATION_LAST_ERROR'] : []),
      ],
      bindingCount: channelBindings('EMAIL').length,
      lastEventAt: emailEvent?.createdAt ?? null,
      lastAcceptanceAt: null,
      controlState: pauseState(controls, 'EMAIL'),
      evidenceSources: ['integration_connections', 'email_events', 'system_controls', 'EMAIL_CHANNEL_DESCRIPTOR'],
    },
    {
      channel: 'WHATSAPP',
      provider: 'META',
      implementationState: whatsappIntegration?.enabled && whatsappIntegration.status === 'CONNECTED' ? 'ACTIVE' : 'NOT_CONFIGURED',
      connectionStatus: whatsappState.connectionStatus,
      credentialHealth: whatsappCredential,
      webhookHealth: whatsappEvent ? 'EVIDENCE_PRESENT' : 'NO_EVENT_EVIDENCE',
      quotaHealth: 'NO_PROVIDER_QUOTA_EVIDENCE',
      lastVerifiedAt: maxIso(
        whatsappIntegration?.last_checked_at,
        whatsappEvent?.createdAt,
        ...channelBindings('WHATSAPP').map((row) => row.last_verified_at),
      ),
      supportedCapabilities: descriptorCapabilities(WHATSAPP_CHANNEL_DESCRIPTOR),
      incidentState: pauseState(controls, 'WHATSAPP') !== 'RUNNING' ? pauseState(controls, 'WHATSAPP') : whatsappState.incidentState,
      blockers: [
        ...(whatsappCredential === 'MISSING' ? ['CREDENTIAL_MISSING'] : []),
        ...(whatsappIntegration?.last_error ? ['INTEGRATION_LAST_ERROR'] : []),
        ...channelBindings('WHATSAPP').flatMap((row) => row.last_error_code ? [row.last_error_code] : []),
      ],
      bindingCount: channelBindings('WHATSAPP').length,
      lastEventAt: whatsappEvent?.createdAt ?? null,
      lastAcceptanceAt: null,
      controlState: pauseState(controls, 'WHATSAPP'),
      evidenceSources: ['integration_connections', 'communication_channel_bindings', 'whatsapp_events', 'system_controls', 'WHATSAPP_CHANNEL_DESCRIPTOR'],
    },
    {
      channel: 'INSTAGRAM',
      provider: 'META',
      implementationState: instagramBindings.length === 0 ? 'INTERNAL_READY' : instagramReadiness.every((row) => row.ready) ? 'ACTIVE' : 'INTERNAL_READY',
      connectionStatus: instagramBindings.length === 0
        ? (instagramIntegration?.status ?? 'NOT_CONFIGURED')
        : instagramReadiness.every((row) => row.ready) ? 'READY' : 'BLOCKED',
      credentialHealth: instagramBindings.length === 0
        ? 'NOT_BOUND'
        : instagramBlockers.some((value) => value.includes('CREDENTIAL') || value.includes('VAULT'))
          ? 'MISSING_OR_INVALID'
          : 'BOUND',
      webhookHealth: instagramEvent ? 'EVIDENCE_PRESENT' : 'IMPLEMENTED_NO_LIVE_EVIDENCE',
      quotaHealth: 'NO_PROVIDER_QUOTA_EVIDENCE',
      lastVerifiedAt: maxIso(
        instagramIntegration?.last_checked_at,
        instagramEvent?.createdAt,
        instagramAcceptance,
        ...instagramBindings.map((row) => row.last_verified_at),
      ),
      supportedCapabilities: ['INBOUND', 'TEXT', 'DELIVERY_RECEIPTS', 'READ_RECEIPTS', 'CANONICAL_SEND_GATE', 'CHATWOOT_PROJECTION', 'DNC_SUPPRESSION', 'HUMAN_TAKEOVER'],
      incidentState: pauseState(controls, 'INSTAGRAM') !== 'RUNNING'
        ? pauseState(controls, 'INSTAGRAM')
        : instagramBindings.length === 0
          ? 'AWAITING_REAL_BINDING'
          : instagramBlockers.length
            ? 'BLOCKED'
            : 'CLEAR',
      blockers: instagramBindings.length === 0 ? ['REAL_BINDING_MISSING'] : instagramBlockers,
      bindingCount: instagramBindings.length,
      lastEventAt: instagramEvent?.createdAt ?? null,
      lastAcceptanceAt: instagramAcceptance,
      controlState: pauseState(controls, 'INSTAGRAM'),
      evidenceSources: ['integration_connections', 'communication_channel_bindings', 'instagram_events', 'instagram_activation_readiness', 'instagram_activation_acceptance_receipts'],
    },
    {
      channel: 'FACEBOOK_MESSENGER',
      provider: 'META',
      implementationState: messengerBindings.length === 0 ? 'INTERNAL_READY' : messengerReadiness.every((row) => row.ready) ? 'ACTIVE' : 'INTERNAL_READY',
      connectionStatus: messengerBindings.length === 0
        ? (messengerIntegration?.status ?? 'ROW_MISSING')
        : messengerReadiness.every((row) => row.ready) ? 'READY' : 'BLOCKED',
      credentialHealth: messengerBindings.length === 0
        ? 'NOT_BOUND'
        : messengerBlockers.some((value) => value.includes('CREDENTIAL') || value.includes('VAULT'))
          ? 'MISSING_OR_INVALID'
          : 'BOUND',
      webhookHealth: messengerEvent ? 'EVIDENCE_PRESENT' : 'IMPLEMENTED_NO_LIVE_EVIDENCE',
      quotaHealth: 'NO_PROVIDER_QUOTA_EVIDENCE',
      lastVerifiedAt: maxIso(
        messengerIntegration?.last_checked_at,
        messengerEvent?.createdAt,
        messengerAcceptance,
        ...messengerBindings.map((row) => row.last_verified_at),
      ),
      supportedCapabilities: ['INBOUND', 'TEXT', 'POSTBACK', 'DELIVERY_RECEIPTS', 'READ_RECEIPTS', 'CANONICAL_SEND_GATE', 'CHATWOOT_PROJECTION', 'DNC_SUPPRESSION', 'HUMAN_TAKEOVER'],
      incidentState: pauseState(controls, 'FACEBOOK_MESSENGER') !== 'RUNNING'
        ? pauseState(controls, 'FACEBOOK_MESSENGER')
        : !messengerIntegration
          ? 'INTEGRATION_ROW_MISSING'
          : messengerBindings.length === 0
            ? 'AWAITING_REAL_BINDING'
            : messengerBlockers.length
              ? 'BLOCKED'
              : 'CLEAR',
      blockers: [
        ...(!messengerIntegration ? ['INTEGRATION_ROW_MISSING'] : []),
        ...(messengerBindings.length === 0 ? ['REAL_BINDING_MISSING'] : messengerBlockers),
      ],
      bindingCount: messengerBindings.length,
      lastEventAt: messengerEvent?.createdAt ?? null,
      lastAcceptanceAt: messengerAcceptance,
      controlState: pauseState(controls, 'FACEBOOK_MESSENGER'),
      evidenceSources: ['integration_connections', 'communication_channel_bindings', 'facebook_messenger_events', 'facebook_messenger_activation_readiness', 'facebook_messenger_activation_acceptance_receipts'],
    },
    {
      channel: 'WEB_CHAT',
      provider: 'SMART_VISIONS',
      implementationState: webChatBindingCount === 0 ? 'INTERNAL_READY' : webChatHealth.every((row) => row.ready) ? 'ACTIVE' : 'INTERNAL_READY',
      connectionStatus: webChatBindingCount === 0
        ? 'AWAITING_REAL_BINDING'
        : webChatHealth.every((row) => row.ready) ? 'ACCEPTED' : 'BLOCKED',
      credentialHealth: 'BUILT_IN_NO_EXTERNAL_CREDENTIAL',
      webhookHealth: webChatLastEvent ? 'EVIDENCE_PRESENT' : 'IMPLEMENTED_NO_LIVE_EVIDENCE',
      quotaHealth: 'NOT_APPLICABLE_BUILT_IN',
      lastVerifiedAt: maxIso(
        webChatAcceptance,
        ...webChatHealth.map((row) => row.inboxLastVerifiedAt),
        webChatLastEvent,
      ),
      supportedCapabilities: ['INBOUND', 'OUTBOUND', 'TEXT', 'MEDIA', 'CONSENT', 'ANONYMOUS_SESSION', 'IDENTITY_TRANSITION', 'CHATWOOT_PROJECTION', 'SECURE_ATTACHMENT_PROXY'],
      incidentState: webChatHealth.some((row) => row.reconciliationCount > 0)
        ? 'RECONCILIATION_REQUIRED'
        : pauseState(controls, 'WEB_CHAT') !== 'RUNNING'
          ? pauseState(controls, 'WEB_CHAT')
          : webChatBindingCount === 0
            ? 'AWAITING_REAL_BINDING'
            : webChatBlockers.length
              ? 'BLOCKED'
              : 'CLEAR',
      blockers: webChatBindingCount === 0 ? ['REAL_BINDING_MISSING'] : webChatBlockers,
      bindingCount: webChatBindingCount,
      lastEventAt: webChatLastEvent,
      lastAcceptanceAt: webChatAcceptance,
      controlState: pauseState(controls, 'WEB_CHAT'),
      evidenceSources: ['communication_channel_bindings', 'web_chat_widget_configs', 'web_chat_events', 'chatwoot_webhook_events', 'web_chat_activation_acceptance_receipts', 'system_controls'],
    },
    {
      channel: 'TELEGRAM',
      provider: 'TELEGRAM',
      implementationState: 'NOT_IMPLEMENTED',
      connectionStatus: 'CUSTOMER_CHANNEL_NOT_ACTIVE',
      credentialHealth: 'NOT_EVALUATED',
      webhookHealth: 'OWNER_ASSISTANT_ONLY',
      quotaHealth: 'NOT_EVALUATED',
      lastVerifiedAt: null,
      supportedCapabilities: [],
      incidentState: 'CUSTOMER_CHANNEL_NOT_IMPLEMENTED',
      blockers: ['OMNI_TELEGRAM_CUSTOMER_MESSAGING_PENDING'],
      bindingCount: 0,
      lastEventAt: null,
      lastAcceptanceAt: null,
      controlState: 'NOT_APPLICABLE',
      evidenceSources: ['MASTER_PROGRAM_SECTIONS'],
    },
    {
      channel: 'TIKTOK',
      provider: 'TIKTOK',
      implementationState: 'NOT_IMPLEMENTED',
      connectionStatus: 'CAPABILITY_NOT_ACTIVATED',
      credentialHealth: 'NOT_EVALUATED',
      webhookHealth: 'NOT_IMPLEMENTED',
      quotaHealth: 'NOT_EVALUATED',
      lastVerifiedAt: null,
      supportedCapabilities: [],
      incidentState: 'API_CAPABILITY_REQUIRES_REVALIDATION',
      blockers: ['OMNI_TIKTOK_PENDING_SUPPORTED_API'],
      bindingCount: 0,
      lastEventAt: null,
      lastAcceptanceAt: null,
      controlState: 'NOT_APPLICABLE',
      evidenceSources: ['MASTER_PROGRAM_SECTIONS'],
    },
    {
      channel: 'SMS_RCS',
      provider: 'UNSELECTED',
      implementationState: 'NOT_IMPLEMENTED',
      connectionStatus: 'PROVIDER_NOT_SELECTED',
      credentialHealth: 'NOT_EVALUATED',
      webhookHealth: 'NOT_IMPLEMENTED',
      quotaHealth: 'NOT_EVALUATED',
      lastVerifiedAt: null,
      supportedCapabilities: [],
      incidentState: 'WORK_PACKAGE_PENDING',
      blockers: ['OMNI_SMS_RCS_PENDING'],
      bindingCount: 0,
      lastEventAt: null,
      lastAcceptanceAt: null,
      controlState: 'NOT_APPLICABLE',
      evidenceSources: ['MASTER_PROGRAM_SECTIONS'],
    },
    {
      channel: 'VOICE',
      provider: 'WHATSAPP_MEDIA',
      implementationState: 'PARTIAL',
      connectionStatus: whatsappState.connectionStatus,
      credentialHealth: whatsappCredential,
      webhookHealth: whatsappEvent ? 'EVIDENCE_PRESENT' : 'NO_EVENT_EVIDENCE',
      quotaHealth: 'NO_PROVIDER_QUOTA_EVIDENCE',
      lastVerifiedAt: maxIso(whatsappIntegration?.last_checked_at, whatsappEvent?.createdAt),
      supportedCapabilities: ['VOICE_NOTE_INBOUND', 'TRANSCRIPTION'],
      incidentState: 'PARTIAL_TELEPHONY_PENDING',
      blockers: ['VOICE_REPLY_AND_TELEPHONY_ACCEPTANCE_PENDING'],
      bindingCount: channelBindings('WHATSAPP').length,
      lastEventAt: whatsappEvent?.createdAt ?? null,
      lastAcceptanceAt: null,
      controlState: pauseState(controls, 'WHATSAPP'),
      evidenceSources: ['whatsapp_events', 'voice_transcriptions', 'system_controls'],
    },
  ];

  return snapshots;
}
