import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { metaGraphVersion, verifyMetaWhatsAppSelectedAssets } from './meta-onboarding';
import { readMetaWhatsAppBindingHealth } from './meta-provisioning';

type StagedCredential = {
  access_token: string;
  secret_ref: string;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string;
};
type Binding = {
  id: string;
  version: number;
  tenantBusinessId: string;
};
export async function importMetaWhatsAppVaultAsset(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  actorUserId: string;
  appId: string;
  bootstrap: () => Promise<Binding>;
  fetchImpl?: typeof fetch;
}) {
  const { data, error } = await input.service.rpc('read_meta_whatsapp_vault_import_credential', {
    p_organization_id: input.organizationId,
    p_tenant_business_id: input.tenantBusinessId,
    p_actor_user_id: input.actorUserId,
  });
  const staged = (Array.isArray(data) && data.length === 1 ? data[0] : null) as StagedCredential | null;
  if (error || !staged?.access_token || !staged.secret_ref || !staged.waba_id
      || !staged.phone_number_id || !staged.display_phone_number) {
    throw new Error('The registered-number connection is not prepared for this Business.');
  }

  // Verify provider identity and subscription before creating any local connection.
  // This path never calls register, subscribed_apps POST, or messages.
  const graphVersion = metaGraphVersion();
  const assets = await verifyMetaWhatsAppSelectedAssets({
    graphVersion, accessToken: staged.access_token, wabaId: staged.waba_id,
    phoneNumberId: staged.phone_number_id, fetchImpl: input.fetchImpl,
  });
  const normalize = (value: string | null) => (value ?? '').replace(/\D/g, '');
  if (normalize(assets.displayPhoneNumber) !== normalize(staged.display_phone_number)) {
    throw new Error('Meta returned a different phone number than the prepared connection.');
  }
  const health = await readMetaWhatsAppBindingHealth({
    graphVersion, accessToken: staged.access_token, appId: input.appId,
    wabaId: staged.waba_id, phoneNumberId: staged.phone_number_id,
    fetchImpl: input.fetchImpl,
  });
  if (!health.subscriptionConfirmed) throw new Error('Meta app subscription is not confirmed.');

  const binding = await input.bootstrap();
  if (binding.tenantBusinessId !== input.tenantBusinessId || !binding.id || binding.version < 1) {
    throw new Error('The connection Business changed before import.');
  }
  const existing = await input.service.from('communication_channel_bindings')
    .select('provider,provider_account_id,provider_destination_id,provider_secret_ref,last_error_code')
    .eq('organization_id', input.organizationId).eq('id', binding.id).single();
  if (existing.error || !existing.data) throw new Error('The canonical connection is unavailable.');
  const row = existing.data;
  if (row.provider_destination_id) {
    if (row.provider !== 'META' || row.provider_account_id !== staged.waba_id
        || row.provider_destination_id !== staged.phone_number_id || !row.provider_secret_ref) {
      throw new Error('This connection already uses another Meta asset.');
    }
    // Never let import silently revoke a human disconnect or replace a credential.
    if (row.last_error_code) throw new Error('The existing connection requires lifecycle reconciliation.');
    const bound = await input.service.rpc('resolve_meta_whatsapp_credential', {
      p_organization_id: input.organizationId, p_tenant_business_id: input.tenantBusinessId,
      p_branch_id: null,
    });
    const credential = Array.isArray(bound.data) && bound.data.length === 1 ? bound.data[0] : null;
    if (bound.error || credential?.binding_id !== binding.id
        || credential.access_token !== staged.access_token) {
      throw new Error('The bound credential requires lifecycle reconciliation.');
    }
    return { ok: true, replayed: true, bindingId: binding.id, version: binding.version,
      displayPhoneNumber: assets.displayPhoneNumber };
  }

  const started = await input.service.rpc('start_meta_whatsapp_setup_attempt', {
    p_organization_id: input.organizationId, p_binding_id: binding.id,
    p_expected_binding_version: binding.version, p_connection_mode: 'API_NEW_NUMBER',
    p_purpose: 'CONNECT', p_actor_user_id: input.actorUserId,
    p_request_key: `meta-whatsapp-vault-start:${binding.id}:${crypto.randomUUID()}`,
  });
  const attempt = Array.isArray(started.data) ? started.data[0] : started.data;
  if (started.error || !attempt?.id || attempt.communication_channel_binding_id !== binding.id
      || attempt.binding_version !== binding.version || attempt.status !== 'STARTED') {
    throw new Error('Unable to start the canonical setup attempt.');
  }
  const completed = await input.service.rpc('complete_meta_whatsapp_setup_attempt', {
    p_organization_id: input.organizationId, p_attempt_id: attempt.id,
    p_binding_id: binding.id, p_expected_binding_version: binding.version,
    p_waba_id: staged.waba_id, p_phone_number_id: staged.phone_number_id,
    p_display_phone_number: assets.displayPhoneNumber, p_access_token: staged.access_token,
    p_actor_user_id: input.actorUserId, p_request_key: `meta-whatsapp-vault-complete:${attempt.id}`,
  });
  const configured = Array.isArray(completed.data) ? completed.data[0] : completed.data;
  if (completed.error || configured?.id !== binding.id
      || configured.provider_account_id !== staged.waba_id
      || configured.provider_destination_id !== staged.phone_number_id) {
    throw new Error('Unable to commit the verified connection securely.');
  }
  const verified = await input.service.rpc('mark_meta_whatsapp_binding_health', {
    p_organization_id: input.organizationId, p_binding_id: binding.id,
    p_expected_version: configured.version, p_health_state: 'VERIFIED',
    p_actor_user_id: input.actorUserId, p_request_key: `meta-whatsapp-vault-health:${attempt.id}`,
  });
  if (verified.error) throw new Error('Connection saved; health evidence requires reconciliation.');
  const verifiedRow = Array.isArray(verified.data) ? verified.data[0] : verified.data;
  return { ok: true, replayed: false, bindingId: binding.id,
    version: verifiedRow?.version ?? configured.version, displayPhoneNumber: assets.displayPhoneNumber };
}
