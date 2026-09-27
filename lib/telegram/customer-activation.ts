import type { SupabaseClient } from '@supabase/supabase-js';

export type TelegramActivationReadiness = {
  ready: boolean;
  blockers: string[];
  bindingId: string | null;
  destinationId: string | null;
  inboxMappingId: string | null;
  telegramAiPaused: boolean;
  reconciliationRequiredCount: number;
};

export async function getTelegramActivationReadiness(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  branchId?: string | null;
}): Promise<TelegramActivationReadiness> {
  const { data, error } = await input.service.rpc('telegram_activation_readiness', {
    p_organization_id: input.organizationId,
    p_tenant_business_id: input.tenantBusinessId,
    p_branch_id: input.branchId ?? null,
  });
  if (error) throw new Error(`Telegram activation readiness failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new Error('Telegram activation readiness returned invalid evidence');
  const value = row as Record<string, unknown>;
  return {
    ready: value.ready === true,
    blockers: Array.isArray(value.blockers) ? value.blockers.map(String) : [],
    bindingId: value.binding_id ? String(value.binding_id) : null,
    destinationId: value.destination_id ? String(value.destination_id) : null,
    inboxMappingId: value.inbox_mapping_id ? String(value.inbox_mapping_id) : null,
    telegramAiPaused: value.telegram_ai_paused !== false,
    reconciliationRequiredCount: Number(value.reconciliation_required_count ?? 0),
  };
}
