import 'server-only';

import { createSupabaseServiceClient } from '@/lib/supabase/service';

type ReadinessRow = {
  ready: boolean;
  blockers: string[];
  binding_id: string | null;
  widget_config_id: string | null;
  public_key: string | null;
  allowed_origins: string[] | null;
  inbox_mapping_id: string | null;
  inbox_last_verified_at: string | null;
  acceptance_observed_at: string | null;
  web_chat_ai_paused: boolean;
  shadow_mode: boolean;
  reconciliation_required_count: number | string;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
};

function oneRow(value: unknown): ReadinessRow | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === 'object' && !Array.isArray(row)
    ? row as ReadinessRow
    : null;
}

function relatedName(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const name = (row as Record<string, unknown>).name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

export async function getWebChatConnectionHealth(organizationId: string) {
  const service = createSupabaseServiceClient();
  const bindings = await service
    .from('communication_channel_bindings')
    .select('id,version,tenant_business_id,branch_id,provider_destination_label,updated_at,tenant_businesses(name,status),branches(name,status)')
    .eq('organization_id', organizationId)
    .eq('channel', 'WEB_CHAT')
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true });

  if (bindings.error) throw new Error('Web Chat binding health lookup failed');

  const result = [];
  for (const binding of bindings.data ?? []) {
    const readiness = await service.rpc('web_chat_activation_readiness', {
      p_organization_id: organizationId,
      p_tenant_business_id: binding.tenant_business_id,
      p_branch_id: binding.branch_id,
    });
    if (readiness.error) throw new Error('Web Chat readiness lookup failed');
    const row = oneRow(readiness.data);
    if (!row) throw new Error('Web Chat readiness result is invalid');

    const blockers = Array.isArray(row.blockers) ? row.blockers.map(String) : [];
    const reconciliationCount = Number(row.reconciliation_required_count ?? 0);
    result.push({
      bindingId: binding.id,
      bindingVersion: binding.version,
      tenantBusinessId: binding.tenant_business_id,
      branchId: binding.branch_id,
      businessName: relatedName(binding.tenant_businesses) ?? binding.tenant_business_id,
      branchName: relatedName(binding.branches) ?? binding.branch_id,
      destinationLabel: binding.provider_destination_label ?? 'Web Chat',
      bindingUpdatedAt: binding.updated_at,
      ready: row.ready === true,
      blockers,
      connectionStatus: row.ready === true
        ? 'ACCEPTED'
        : blockers.length === 1 && blockers[0] === 'LIVE_ACCEPTANCE_EVIDENCE_MISSING'
          ? 'READY_FOR_REAL_ACCEPTANCE'
          : 'BLOCKED',
      widgetStatus: row.widget_config_id && row.public_key ? 'ENABLED' : 'NOT_READY',
      publicKey: row.public_key,
      allowedOrigins: Array.isArray(row.allowed_origins) ? row.allowed_origins.map(String) : [],
      originStatus: Array.isArray(row.allowed_origins) && row.allowed_origins.length > 0 ? 'EXACT_ORIGINS_CONFIGURED' : 'NOT_READY',
      chatwootInboxStatus: row.inbox_mapping_id ? 'ACTIVE_VERIFIED' : 'NOT_READY',
      inboxLastVerifiedAt: row.inbox_last_verified_at,
      inboundHealth: row.last_inbound_at ? 'EVIDENCE_PRESENT' : 'NO_EVIDENCE',
      outboundHealth: row.last_outbound_at ? 'EVIDENCE_PRESENT' : 'NO_EVIDENCE',
      lastInboundAt: row.last_inbound_at,
      lastOutboundAt: row.last_outbound_at,
      lastAcceptanceAt: row.acceptance_observed_at,
      reconciliationCount: Number.isFinite(reconciliationCount) ? reconciliationCount : 0,
      incidentStatus: reconciliationCount > 0 ? 'RECONCILIATION_REQUIRED' : 'CLEAR',
      aiPaused: row.web_chat_ai_paused !== false,
      shadowMode: row.shadow_mode !== false,
    });
  }

  return result;
}
