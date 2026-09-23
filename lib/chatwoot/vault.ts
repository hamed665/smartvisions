import 'server-only';

import { createSupabaseServiceClient } from '@/lib/supabase/service';

const CHATWOOT_VAULT_REF_RE =
  /^secretref:\/\/supabase-vault\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isChatwootVaultRef(value: unknown): value is string {
  return typeof value === 'string' && CHATWOOT_VAULT_REF_RE.test(value.trim());
}

export async function createChatwootVaultSecret(input: {
  secret: string;
  name: string;
  description?: string | null;
}) {
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc('chatwoot_vault_create_secret', {
    p_secret: input.secret,
    p_name: input.name,
    p_description: input.description ?? null,
  });

  if (error) {
    throw new Error('Chatwoot Vault secret creation failed');
  }

  if (!isChatwootVaultRef(data)) {
    throw new Error('Chatwoot Vault returned an invalid secret reference');
  }

  return data;
}

export async function updateChatwootVaultSecret(input: {
  secretRef: string;
  secret: string;
  name?: string | null;
  description?: string | null;
}) {
  if (!isChatwootVaultRef(input.secretRef)) {
    throw new Error('Invalid Chatwoot Vault secret reference');
  }

  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc('chatwoot_vault_update_secret', {
    p_secret_ref: input.secretRef,
    p_secret: input.secret,
    p_name: input.name ?? null,
    p_description: input.description ?? null,
  });

  if (error) {
    throw new Error('Chatwoot Vault secret update failed');
  }

  if (!isChatwootVaultRef(data) || data !== input.secretRef) {
    throw new Error('Chatwoot Vault returned an unexpected secret reference');
  }

  return data;
}

export async function readChatwootVaultSecret(secretRef: string) {
  if (!isChatwootVaultRef(secretRef)) {
    throw new Error('Invalid Chatwoot Vault secret reference');
  }

  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc('chatwoot_vault_read_secret', {
    p_secret_ref: secretRef,
  });

  if (error || typeof data !== 'string' || data.length < 1) {
    throw new Error('Chatwoot Vault secret read failed');
  }

  return data;
}
