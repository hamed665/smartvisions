import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { ensureChatwootAccount, reconcileChatwootAccount, ChatwootProvisioningError } from './provisioning';
import type { ChatwootAccountMappingRow } from './tenant-bridge';

export async function recoverChatwootAccountFromVerifiedAbsence(input: {
  supabase: SupabaseClient;
  organizationId: string;
  mapping: ChatwootAccountMappingRow;
  requestKey: string;
  name: string;
  beforeExternalCreate: () => Promise<void>;
  fetchImpl?: typeof fetch;
}) {
  const rawOrigin = process.env.CHATWOOT_BASE_URL;
  if (!rawOrigin) return null;
  const origin = new URL(rawOrigin).origin;
  const service = createSupabaseServiceClient();
  const { data: auth, error: authError } = await input.supabase.auth.getUser();
  if (authError || !auth.user?.id) return null;
  const { data: receipt, error } = await service.from('chatwoot_account_reconciliation_receipts')
    .select('id,organization_id,mapping_id,mapping_version,tenant_business_id,original_request_key,authorized_owner_id,origin,expires_at')
    .eq('organization_id', input.organizationId).eq('mapping_id', input.mapping.id)
    .eq('mapping_version', input.mapping.version).eq('authorized_owner_id', auth.user.id)
    .eq('origin', origin).eq('original_request_key', input.requestKey)
    .gt('expires_at', new Date().toISOString()).order('observed_at', { ascending: false }).limit(1).maybeSingle();
  if (error || !receipt || receipt.tenant_business_id !== input.mapping.tenant_business_id) return null;
  const { data: mayCreate, error: claimError } = await input.supabase.rpc('claim_chatwoot_account_receipt_recovery', {
    p_org: input.organizationId, p_mapping: input.mapping.id, p_version: input.mapping.version,
    p_receipt: receipt.id, p_origin: origin, p_original_key: input.requestKey,
  });
  if (claimError || typeof mayCreate !== 'boolean') {
    throw new ChatwootProvisioningError('RECONCILIATION_REQUIRED', 'Account recovery claim unavailable');
  }
  if (!mayCreate) return reconcileChatwootAccount({ tenantBusinessId: input.mapping.tenant_business_id, fetchImpl: input.fetchImpl });
  // ensureAccount re-lists before POST. Its exact pre-POST callback rechecks canonical OWNER,
  // mapping, gate and protected review. A spent recovery can only GET/reconcile afterward.
  return (await ensureChatwootAccount({
    tenantBusinessId: input.mapping.tenant_business_id, name: input.name, fetchImpl: input.fetchImpl,
    beforeCreate: async () => {
      await input.beforeExternalCreate();
      const fresh = await input.supabase.from('chatwoot_account_reconciliation_receipts')
        .select('id').eq('id', receipt.id).eq('organization_id', input.organizationId)
        .eq('mapping_id', input.mapping.id).eq('mapping_version', input.mapping.version)
        .gt('expires_at', new Date().toISOString()).maybeSingle();
      if (fresh.error || !fresh.data) throw new ChatwootProvisioningError('RECONCILIATION_REQUIRED', 'Account absence review expired or OWNER revoked');
    },
  })).account;
}
