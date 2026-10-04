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
    .limit(2);

  if (bindingResult.error) {
    throw new CustomerBusinessAccessError(
      'DATABASE',
      'Unable to load customer connection state',
    );
  }

  const bindings = (bindingResult.data ?? []) as WhatsAppBindingRow[];
  if (bindings.length > 1) {
    return {
      ...access,
      whatsapp: {
        ...deriveCustomerWhatsAppConnection({ binding: bindings[0] }),
        status: 'Action required' as const,
        canConnect: false,
        canReconnect: false,
        canDisconnect: false,
        reason: 'Multiple active WhatsApp bindings require reconciliation before customer actions are enabled.',
      },
    };
  }

  const binding = bindings[0] ?? null;
  let integration: IntegrationRow | null = null;

  if (binding?.integration_connection_id) {
    const integrationResult = await supabase
      .from('integration_connections')
      .select('id,provider,channel,enabled,status,last_checked_at,last_error')
      .eq('organization_id', business.organizationId)
      .eq('id', binding.integration_connection_id)
      .maybeSingle();

    if (integrationResult.error) {
      throw new CustomerBusinessAccessError(
        'DATABASE',
        'Unable to load customer provider state',
      );
    }
    integration = integrationResult.data as IntegrationRow | null;
  }

  return {
    ...access,
    whatsapp: deriveCustomerWhatsAppConnection({ binding, integration }),
  };
}
