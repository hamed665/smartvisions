import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { chatwootAdminAccountRequest } from '@/lib/chatwoot/account-admin-request';
import { ChatwootHttpError } from '@/lib/chatwoot/http';
import {
  ChatwootProvisioningError,
} from '@/lib/chatwoot/provisioning';
import { createChatwootVaultSecret } from '@/lib/chatwoot/vault';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { isUuid } from '@/lib/chatwoot/tenant-bridge';
import { normalizeChatwootInt32Id } from '@/lib/chatwoot/tenant-bridge-slice-b';

type InboxMappingRow = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  branch_id: string | null;
  communication_channel_binding_id: string;
  chatwoot_account_mapping_id: string;
  chatwoot_inbox_id: number | null;
  chatwoot_channel_identifier: string | null;
  status: 'PROVISIONING' | 'ACTIVE' | 'DEGRADED' | 'ARCHIVED';
  version: number;
  last_request_key: string;
  webhook_secret_ref: string | null;
  hmac_token_ref: string | null;
};

type ApiInboxProjection = {
  id: number;
  name: string;
  webhookUrl: string;
  identifier: string;
  secret: string;
  hmacToken: string;
};

function requireText(value: string, field: string, max = 255) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new ChatwootProvisioningError('INVALID_INPUT', `${field} is invalid`);
  }
  return normalized;
}

function requireUuid(value: string, field: string) {
  const normalized = value.trim();
  if (!isUuid(normalized)) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      `${field} must be a canonical UUID`,
    );
  }
  return normalized;
}

function childKey(base: string, suffix: string) {
  const root = requireText(base, 'requestKey', 160);
  const value = `${root}:${suffix}`;
  if (value.length > 200) {
    throw new ChatwootProvisioningError('INVALID_INPUT', 'requestKey is too long');
  }
  return value;
}

function publicWebhookOrigin() {
  const raw = process.env.CHATWOOT_WEBHOOK_PUBLIC_ORIGIN?.trim();
  if (!raw) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      'Chatwoot webhook public origin is not configured',
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      'Chatwoot webhook public origin is invalid',
    );
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new ChatwootProvisioningError(
      'INVALID_INPUT',
      'Chatwoot webhook public origin must be an HTTPS origin',
    );
  }

  return url.origin;
}

function normalizeMapping(value: unknown): InboxMappingRow {
  const single = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (!single || typeof single !== 'object' || Array.isArray(single)) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot Inbox mapping response is invalid',
    );
  }
  return single as InboxMappingRow;
}

function markerMatches(
  attrs: unknown,
  mappingId: string,
  tenantBusinessId: string,
) {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return false;
  const row = attrs as Record<string, unknown>;
  return (
    row.smartvisions_projection === true &&
    row.smartvisions_inbox_mapping_id === mappingId &&
    row.smartvisions_tenant_business_id === tenantBusinessId &&
    row.smartvisions_projection_version === '1'
  );
}

function parseApiInbox(
  value: unknown,
  input: {
    mappingId: string;
    tenantBusinessId: string;
    webhookUrl: string;
  },
): ApiInboxProjection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot Inbox response is invalid',
    );
  }

  const row = value as Record<string, unknown>;
  const id = normalizeChatwootInt32Id(row.id);
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const channelType =
    typeof row.channel_type === 'string' ? row.channel_type : '';
  const webhookUrl =
    typeof row.webhook_url === 'string' ? row.webhook_url.trim() : '';
  const identifier =
    typeof row.inbox_identifier === 'string'
      ? row.inbox_identifier.trim()
      : '';
  const secret = typeof row.secret === 'string' ? row.secret : '';
  const hmacToken =
    typeof row.hmac_token === 'string' ? row.hmac_token : '';

  if (
    id === null ||
    !name ||
    channelType !== 'Channel::Api' ||
    webhookUrl !== input.webhookUrl ||
    identifier.length < 1 ||
    identifier.length > 128 ||
    secret.length < 1 ||
    hmacToken.length < 1 ||
    !markerMatches(
      row.additional_attributes,
      input.mappingId,
      input.tenantBusinessId,
    )
  ) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot API Inbox does not match the Smart projection contract',
    );
  }

  return { id, name, webhookUrl, identifier, secret, hmacToken };
}

async function reconcileApiInbox(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  mappingId: string;
  webhookUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const raw = await chatwootAdminAccountRequest<unknown>({
    supabase: input.supabase,
    organizationId: input.organizationId,
    tenantBusinessId: input.tenantBusinessId,
    resourcePath: '/inboxes',
    method: 'GET',
    fetchImpl: input.fetchImpl,
  });

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot Inbox list response is invalid',
    );
  }

  const payload = (raw as Record<string, unknown>).payload;
  if (!Array.isArray(payload)) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot Inbox list payload is invalid',
    );
  }

  const matches = payload.filter((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    return markerMatches(
      (row as Record<string, unknown>).additional_attributes,
      input.mappingId,
      input.tenantBusinessId,
    );
  });

  if (matches.length > 1) {
    throw new ChatwootProvisioningError(
      'DUPLICATE_MATCH',
      'Multiple Chatwoot Inboxes match the Smart mapping marker',
    );
  }

  return matches.length === 1
    ? parseApiInbox(matches[0], input)
    : null;
}

async function createOrReconcileApiInbox(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  mappingId: string;
  projectedName: string;
  webhookUrl: string;
  fetchImpl?: typeof fetch;
}) {
  const existing = await reconcileApiInbox(input);
  if (existing) return { inbox: existing, outcome: 'RECONCILED_EXISTING' as const };

  const body = {
    name: input.projectedName,
    channel: {
      type: 'api',
      webhook_url: input.webhookUrl,
      hmac_mandatory: true,
      additional_attributes: {
        smartvisions_projection: true,
        smartvisions_inbox_mapping_id: input.mappingId,
        smartvisions_tenant_business_id: input.tenantBusinessId,
        smartvisions_projection_version: '1',
      },
    },
  };

  try {
    const created = await chatwootAdminAccountRequest<unknown>({
      supabase: input.supabase,
      organizationId: input.organizationId,
      tenantBusinessId: input.tenantBusinessId,
      resourcePath: '/inboxes',
      method: 'POST',
      body,
      fetchImpl: input.fetchImpl,
    });

    return {
      inbox: parseApiInbox(created, input),
      outcome: 'CREATED' as const,
    };
  } catch (error) {
    if (!(error instanceof ChatwootHttpError) || !error.ambiguousMutationOutcome) {
      throw error;
    }

    const reconciled = await reconcileApiInbox(input);
    if (!reconciled) {
      throw new ChatwootProvisioningError(
        'RECONCILIATION_REQUIRED',
        'Ambiguous Chatwoot Inbox create is not confirmed by marker reconciliation',
      );
    }

    return {
      inbox: reconciled,
      outcome: 'RECONCILED_AFTER_AMBIGUOUS_CREATE' as const,
    };
  }
}

async function recordInboxReceipt(input: {
  organizationId: string;
  tenantBusinessId: string;
  mapping: InboxMappingRow;
  inbox: ApiInboxProjection;
  webhookSecretRef: string;
  hmacTokenRef: string;
  requestKey: string;
}) {
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc(
    'record_chatwoot_inbox_reconciliation',
    {
      p_organization_id: input.organizationId,
      p_tenant_business_id: input.tenantBusinessId,
      p_inbox_mapping_id: input.mapping.id,
      p_expected_mapping_version: input.mapping.version,
      p_observed_chatwoot_inbox_id: input.inbox.id,
      p_observed_channel_identifier: input.inbox.identifier,
      p_observed_webhook_url: input.inbox.webhookUrl,
      p_webhook_secret_ref: input.webhookSecretRef,
      p_hmac_token_ref: input.hmacTokenRef,
      p_request_key: input.requestKey,
    },
  );

  if (error) {
    throw new ChatwootProvisioningError(
      'RECONCILIATION_REQUIRED',
      'Chatwoot Inbox reconciliation receipt could not be persisted',
    );
  }

  const single = Array.isArray(data) && data.length === 1 ? data[0] : data;
  if (
    !single ||
    typeof single !== 'object' ||
    Array.isArray(single) ||
    !isUuid(String((single as Record<string, unknown>).id ?? ''))
  ) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot Inbox reconciliation receipt response is invalid',
    );
  }

  return single as Record<string, unknown>;
}

export async function provisionChatwootApiInbox(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  branchId: string;
  communicationChannelBindingId: string;
  chatwootAccountMappingId: string;
  projectedName: string;
  requestKey: string;
  fetchImpl?: typeof fetch;
}) {
  const organizationId = requireUuid(input.organizationId, 'organizationId');
  const tenantBusinessId = requireUuid(
    input.tenantBusinessId,
    'tenantBusinessId',
  );
  const branchId = requireUuid(input.branchId, 'branchId');
  const bindingId = requireUuid(
    input.communicationChannelBindingId,
    'communicationChannelBindingId',
  );
  const accountMappingId = requireUuid(
    input.chatwootAccountMappingId,
    'chatwootAccountMappingId',
  );
  const projectedName = requireText(input.projectedName, 'projectedName', 120);
  const webhookOrigin = publicWebhookOrigin();
  const createRequestKey = childKey(input.requestKey, 'create');
  const receiptRequestKey = childKey(input.requestKey, 'receipt');
  const activateRequestKey = childKey(input.requestKey, 'activate');

  const { data: mappingData, error: mappingError } = await input.supabase.rpc(
    'create_chatwoot_inbox_mapping',
    {
      p_organization_id: organizationId,
      p_tenant_business_id: tenantBusinessId,
      p_branch_id: branchId,
      p_communication_channel_binding_id: bindingId,
      p_chatwoot_account_mapping_id: accountMappingId,
      p_request_key: createRequestKey,
    },
  );

  if (mappingError) {
    throw new ChatwootProvisioningError(
      'RECONCILIATION_REQUIRED',
      'Chatwoot Inbox mapping could not be claimed',
    );
  }

  const mapping = normalizeMapping(mappingData);
  if (
    mapping.id.length < 1 ||
    mapping.organization_id !== organizationId ||
    mapping.tenant_business_id !== tenantBusinessId
  ) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Chatwoot Inbox mapping does not match requested scope',
    );
  }

  if (mapping.status === 'ACTIVE') {
    return { mapping, outcome: 'ALREADY_ACTIVE' as const };
  }
  if (mapping.status === 'ARCHIVED') {
    throw new ChatwootProvisioningError(
      'IDENTITY_CONFLICT',
      'ARCHIVED Chatwoot Inbox mapping is terminal',
    );
  }

  const webhookUrl =
    `${webhookOrigin}/api/chatwoot/webhook/${mapping.id}`;

  const external = await createOrReconcileApiInbox({
    supabase: input.supabase,
    organizationId,
    tenantBusinessId,
    mappingId: mapping.id,
    projectedName,
    webhookUrl,
    fetchImpl: input.fetchImpl,
  });

  const [webhookSecretRef, hmacTokenRef] = await Promise.all([
    createChatwootVaultSecret({
      secret: external.inbox.secret,
      name: `chatwoot/inbox/${mapping.id}/webhook-secret`,
      description: 'Chatwoot Channel::Api outbound webhook signing secret',
    }),
    createChatwootVaultSecret({
      secret: external.inbox.hmacToken,
      name: `chatwoot/inbox/${mapping.id}/hmac-token`,
      description: 'Chatwoot Channel::Api inbound client HMAC token',
    }),
  ]);

  const receipt = await recordInboxReceipt({
    organizationId,
    tenantBusinessId,
    mapping,
    inbox: external.inbox,
    webhookSecretRef,
    hmacTokenRef,
    requestKey: receiptRequestKey,
  });

  const receiptId = String(receipt.id);
  const { data: activatedData, error: activatedError } = await input.supabase.rpc(
    'activate_chatwoot_inbox_mapping_verified',
    {
      p_organization_id: organizationId,
      p_tenant_business_id: tenantBusinessId,
      p_inbox_mapping_id: mapping.id,
      p_expected_version: mapping.version,
      p_receipt_id: receiptId,
      p_request_key: activateRequestKey,
    },
  );

  if (activatedError) {
    throw new ChatwootProvisioningError(
      'RECONCILIATION_REQUIRED',
      'Chatwoot Inbox activation requires reconciliation',
    );
  }

  const activated = normalizeMapping(activatedData);
  if (
    activated.id !== mapping.id ||
    activated.status !== 'ACTIVE' ||
    activated.chatwoot_inbox_id !== external.inbox.id ||
    activated.chatwoot_channel_identifier !== external.inbox.identifier ||
    !activated.webhook_secret_ref ||
    !activated.hmac_token_ref
  ) {
    throw new ChatwootProvisioningError(
      'UPSTREAM_MISMATCH',
      'Activated Chatwoot Inbox mapping is inconsistent',
    );
  }

  return {
    mapping: activated,
    outcome: external.outcome,
  };
}
