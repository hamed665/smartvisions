import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  CustomerBusinessAccessError,
  loadCustomerBusinessAccessContext,
} from '@/lib/access/customer-business-scope';
import {
  DEFAULT_INTEGRATION_STALE_MS,
  integrationFreshness,
} from '@/lib/reliability/operational-truth';
import { createClient } from '@/lib/supabase/server';

export type CustomerConnectionStatus =
  | 'Connected'
  | 'Action required'
  | 'Not connected'
  | 'Degraded-needs verification';

type WhatsAppBindingRow = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  integration_connection_id: string;
  status: string;
  version: number;
  provider: string | null;
  provider_account_id: string | null;
  provider_destination_id: string | null;
  provider_destination_label: string | null;
  provider_secret_ref: string | null;
  last_verified_at: string | null;
  last_error_code: string | null;
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

export type CustomerWhatsAppConnection = {
  status: CustomerConnectionStatus;
  bindingId: string | null;
  bindingVersion: number | null;
  destinationLabel: string | null;
  lastVerifiedAt: string | null;
  lastCheckedAt: string | null;
  incidentCode: string | null;
  canConnect: boolean;
  canReconnect: boolean;
  canDisconnect: boolean;
  reason: string;
};

function freshIso(value: string | null | undefined, now: Date) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    && Math.max(0, now.getTime() - timestamp) <= DEFAULT_INTEGRATION_STALE_MS;
}

export function deriveCustomerWhatsAppConnection(input: {
  binding?: WhatsAppBindingRow | null;
  integration?: IntegrationRow | null;
  now?: Date;
}): CustomerWhatsAppConnection {
  const binding = input.binding ?? null;
  const integration = input.integration ?? null;
  const now = input.now ?? new Date();

  if (!binding) {
    return {
      status: 'Not connected',
      bindingId: null,
      bindingVersion: null,
      destinationLabel: null,
      lastVerifiedAt: null,
      lastCheckedAt: null,
      incidentCode: null,
      canConnect: true,
      canReconnect: false,
      canDisconnect: false,
      reason: 'No canonical WhatsApp binding exists for this Business.',
    };
  }

  const base = {
    bindingId: binding.id,
    bindingVersion: binding.version,
    destinationLabel: binding.provider_destination_label,
    lastVerifiedAt: binding.last_verified_at,
    lastCheckedAt: integration?.last_checked_at ?? null,
    incidentCode: binding.last_error_code ?? integration?.last_error ?? null,
  };

  if (binding.last_error_code === 'MANUAL_DISCONNECTED') {
    return {
      ...base,
      status: 'Action required',
      canConnect: false,
      canReconnect: true,
      canDisconnect: false,
      reason: 'WhatsApp API is disconnected safely. Reconnect the same logical binding.',
    };
  }

  const hasProviderIdentity = binding.status === 'ACTIVE'
    && binding.provider === 'META'
    && Boolean(binding.provider_account_id)
    && Boolean(binding.provider_destination_id)
    && Boolean(binding.provider_secret_ref);

  if (!hasProviderIdentity) {
    return {
      ...base,
      status: 'Not connected',
      canConnect: true,
      canReconnect: false,
      canDisconnect: false,
      reason: 'The Business has a WhatsApp binding, but Meta authorization is not complete.',
    };
  }

  if (
    binding.last_error_code
    || !integration
    || integration.provider !== 'META'
    || integration.channel !== 'WHATSAPP'
    || !integration.enabled
    || integration.status !== 'CONNECTED'
    || integration.last_error
  ) {
    return {
      ...base,
      status: 'Action required',
      canConnect: false,
      canReconnect: true,
      canDisconnect: true,
      reason: 'The canonical binding exists, but provider or integration state requires attention.',
    };
  }

  const integrationHealth = integrationFreshness({
    status: integration.status,
    enabled: integration.enabled,
    lastCheckedAt: integration.last_checked_at,
    lastError: integration.last_error,
    credentialPresent: true,
    now,
  });

  if (
    integrationHealth !== 'HEALTHY'
    || !freshIso(binding.last_verified_at, now)
  ) {
    return {
      ...base,
      status: 'Degraded-needs verification',
      canConnect: false,
      canReconnect: true,
      canDisconnect: true,
      reason: 'The connection exists, but recent provider verification evidence is missing or stale.',
    };
  }

  return {
    ...base,
    status: 'Connected',
    canConnect: false,
    canReconnect: false,
    canDisconnect: true,
    reason: 'Meta identity, Vault credential binding, connected integration, and recent verification evidence are present.',
  };
}

export async function loadCustomerConnections(input: {
  requestedBusinessId?: string | null;
  supabase?: SupabaseClient;
}) {
  const supabase = input.supabase ?? await createClient();
  const access = await loadCustomerBusinessAccessContext({
    requestedBusinessId: input.requestedBusinessId,
    supabase,
  });

  const business = access.selectedBusiness;
  if (!business) {
    return {
      ...access,
      whatsappBindings: [],
      whatsappBindingOptions: [],
      whatsapp: deriveCustomerWhatsAppConnection({}),
    };
  }

  const bindingResult = await supabase
    .from('communication_channel_bindings')
    .select(
      'id,organization_id,tenant_business_id,integration_connection_id,status,version,provider,provider_account_id,provider_destination_id,provider_destination_label,provider_secret_ref,last_verified_at,last_error_code',
    )
    .eq('organization_id', business.organizationId)
    .eq('tenant_business_id', business.id)
    .eq('channel', 'WHATSAPP')
    .eq('status', 'ACTIVE')
    .order('updated_at', { ascending: false })
    .limit(25);

  if (bindingResult.error) {
    throw new CustomerBusinessAccessError(
      'DATABASE',
      'Unable to load customer connection state',
    );
  }

  const bindings = (bindingResult.data ?? []) as WhatsAppBindingRow[];
  const integrationIds = [...new Set(
    bindings.map((binding) => binding.integration_connection_id).filter(Boolean),
  )];

  let integrations: IntegrationRow[] = [];
  if (integrationIds.length) {
    const integrationResult = await supabase
      .from('integration_connections')
      .select('id,provider,channel,enabled,status,last_checked_at,last_error')
      .eq('organization_id', business.organizationId)
      .in('id', integrationIds);

    if (integrationResult.error) {
      throw new CustomerBusinessAccessError(
        'DATABASE',
        'Unable to load customer provider state',
      );
    }
    integrations = (integrationResult.data ?? []) as IntegrationRow[];
  }

  const integrationById = new Map(integrations.map((row) => [row.id, row]));
  const whatsappBindings = bindings.map((binding) =>
    deriveCustomerWhatsAppConnection({
      binding,
      integration: integrationById.get(binding.integration_connection_id) ?? null,
    }),
  );
  const whatsappBindingOptions = bindings.map((binding) => ({
    id: binding.id,
    version: binding.version,
    tenantBusinessId: binding.tenant_business_id,
    businessName: business.name,
    branchName: null,
    provider: binding.provider,
    configured: binding.provider === 'META'
      && Boolean(binding.provider_destination_id)
      && Boolean(binding.provider_secret_ref),
    destinationLabel: binding.provider_destination_label,
    lastErrorCode: binding.last_error_code,
    lastVerifiedAt: binding.last_verified_at,
  }));

  if (!whatsappBindings.length) {
    return {
      ...access,
      whatsappBindings,
      whatsappBindingOptions,
      whatsapp: deriveCustomerWhatsAppConnection({}),
    };
  }

  if (whatsappBindings.length === 1) {
    return {
      ...access,
      whatsappBindings,
      whatsappBindingOptions,
      whatsapp: whatsappBindings[0],
    };
  }

  const statuses = whatsappBindings.map((row) => row.status);
  const status: CustomerConnectionStatus = statuses.every((value) => value === 'Connected')
    ? 'Connected'
    : statuses.includes('Action required')
      ? 'Action required'
      : statuses.includes('Degraded-needs verification')
        ? 'Degraded-needs verification'
        : statuses.every((value) => value === 'Not connected')
          ? 'Not connected'
          : 'Action required';

  return {
    ...access,
    whatsappBindings,
    whatsappBindingOptions,
    whatsapp: {
      status,
      bindingId: null,
      bindingVersion: null,
      destinationLabel: `${whatsappBindings.length} WhatsApp connections`,
      lastVerifiedAt: whatsappBindings
        .map((row) => row.lastVerifiedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
      lastCheckedAt: whatsappBindings
        .map((row) => row.lastCheckedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
      incidentCode: whatsappBindings.find((row) => row.incidentCode)?.incidentCode ?? null,
      canConnect: statuses.every((value) => value === 'Not connected'),
      canReconnect: whatsappBindings.some((row) => row.canReconnect),
      canDisconnect: whatsappBindings.some((row) => row.canDisconnect),
      reason: `${whatsappBindings.length} canonical WhatsApp bindings exist for this Business. Status is aggregated conservatively across them.`,
    },
  };
}
