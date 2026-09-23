const CHATWOOT_VAULT_REF_RE =
  /^secretref:\/\/supabase-vault\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isChatwootVaultRef(value: unknown): value is string {
  return typeof value === 'string' && CHATWOOT_VAULT_REF_RE.test(value.trim());
}
