import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isChatwootVaultRef } from '@/lib/chatwoot/vault-ref';

const migration = fs.readFileSync(
  'supabase/migrations/0079_chatwoot_vault_boundary.sql',
  'utf8',
);
const runtime = fs.readFileSync('lib/chatwoot/vault.ts', 'utf8');
const bootstrap = fs.readFileSync(
  'tests/sql/chatwoot-vault-bootstrap.sql',
  'utf8',
);
const smoke = fs.readFileSync(
  'tests/sql/chatwoot-vault-boundary-smoke.sql',
  'utf8',
);

describe('COMM-TENANT-BRIDGE Slice C1 Vault boundary', () => {
  it('accepts only canonical Supabase Vault secret references', () => {
    expect(
      isChatwootVaultRef(
        'secretref://supabase-vault/123e4567-e89b-12d3-a456-426614174000',
      ),
    ).toBe(true);
    expect(isChatwootVaultRef('vault://123e4567-e89b-12d3-a456-426614174000')).toBe(false);
    expect(isChatwootVaultRef('secretref://supabase-vault/not-a-uuid')).toBe(false);
  });

  it('uses SECURITY INVOKER only and grants wrappers only to service_role', () => {
    const functions =
      migration.match(/create or replace function public\./gi) ?? [];
    const invokers = migration.match(/security invoker/gi) ?? [];

    expect(migration).not.toMatch(/security\s+definer/i);
    expect(invokers).toHaveLength(functions.length);
    expect(migration).toContain('grant execute on function public.chatwoot_vault_create_secret');
    expect(migration).toContain('to service_role');
    expect(migration).not.toMatch(
      /grant\s+execute[^;]*chatwoot_vault_[^;]*\bto\s+(?:authenticated|anon)\b/is,
    );
  });

  it('keeps Vault schema access behind server-only RPC wrappers', () => {
    expect(runtime).toContain("import 'server-only'");
    expect(runtime).toContain("service.rpc('chatwoot_vault_create_secret'");
    expect(runtime).toContain("service.rpc('chatwoot_vault_update_secret'");
    expect(runtime).toContain("service.rpc('chatwoot_vault_read_secret'");
    expect(runtime).not.toMatch(/\.schema\(['"]vault['"]\)/);
    expect(runtime).not.toMatch(/from\(['"]decrypted_secrets['"]\)/);
  });

  it('does not log or interpolate secret plaintext into error messages', () => {
    expect(runtime).not.toMatch(/console\.(?:log|error|warn)/);
    expect(runtime).not.toMatch(/JSON\.stringify\(.*secret/i);
    expect(runtime).not.toMatch(/\$\{input\.secret\}/);
    expect(runtime).not.toMatch(/\$\{data\}/);
  });

  it('contains no Chatwoot/provider HTTP side effect in C1', () => {
    expect(runtime).not.toMatch(/\bfetch\s*\(|axios|platform\/api\/v1/i);
    expect(runtime).not.toMatch(/graph\.facebook|resend\.com|send_whatsapp|send_email/i);
  });

  it('uses the verified Supabase Vault API surface', () => {
    expect(migration).toContain('vault.create_secret(');
    expect(migration).toContain('vault.update_secret(');
    expect(migration).toContain('vault.decrypted_secrets');
    expect(migration).toContain('secretref://supabase-vault/');
  });

  it('keeps the PostgreSQL Vault emulation explicitly CI-only and rollback-only', () => {
    expect(bootstrap).toContain('CI-only Supabase Vault contract bootstrap');
    expect(bootstrap).toContain('does NOT emulate Vault encryption');
    expect(smoke).toMatch(/^begin;/m);
    expect(smoke).toMatch(/^rollback;/m);

    const doBlocks = [...smoke.matchAll(/do \$\$([\s\S]*?)\$\$;/g)].map(
      (match) => match[1],
    );
    expect(doBlocks.some((block) => /:'[A-Za-z0-9_]+'/.test(block))).toBe(false);
    expect(smoke).not.toMatch(/\bdo \$\n/);
    expect(smoke).not.toMatch(/\n\$;\n/);
  });
});
