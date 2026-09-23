import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isChatwootVaultRef } from '@/lib/chatwoot/vault-ref';

const migration = fs.readFileSync(
  'supabase/migrations/0079_chatwoot_vault_boundary.sql',
  'utf8',
);
const runtime = fs.readFileSync('lib/chatwoot/vault.ts', 'utf8');
const serviceClient = fs.readFileSync('lib/supabase/service.ts', 'utf8');
const bootstrap = fs.readFileSync(
  'tests/sql/chatwoot-vault-bootstrap.sql',
  'utf8',
);
const smoke = fs.readFileSync(
  'tests/sql/chatwoot-vault-boundary-smoke.sql',
  'utf8',
);

describe('COMM-TENANT-BRIDGE Slice C1 Vault boundary', () => {
  it('accepts only canonical Supabase Vault references', () => {
    expect(
      isChatwootVaultRef(
        'secretref://supabase-vault/00000000-0000-0000-0000-000000000001',
      ),
    ).toBe(true);
    expect(isChatwootVaultRef('vault://secret')).toBe(false);
    expect(isChatwootVaultRef('secretref://supabase-vault/not-a-uuid')).toBe(
      false,
    );
  });

  it('keeps all Vault wrappers SECURITY INVOKER', () => {
    const functions = [
      ...migration.matchAll(
        /create or replace function public\.([A-Za-z0-9_]+)\([\s\S]*?\n\$\$;/gi,
      ),
    ];

    expect(functions.length).toBeGreaterThanOrEqual(5);
    for (const match of functions) {
      expect(match[0]).toMatch(/security\s+invoker/i);
      expect(match[0]).not.toMatch(/security\s+definer/i);
    }

    expect(migration).not.toMatch(/security\s+definer/i);
  });

  it('grants wrapper execution only to service_role', () => {
    expect(migration).toContain(
      'revoke all on function public.chatwoot_vault_create_secret',
    );
    expect(migration).toContain(
      'grant execute on function public.chatwoot_vault_create_secret',
    );
    expect(migration).toContain('to service_role');
    expect(migration).not.toMatch(
      /grant\s+execute[^;]*\bto\s+(?:authenticated|anon)\b/is,
    );
  });

  it('makes deterministic-name create replay safe and collision fail closed', () => {
    expect(migration).toContain('from vault.decrypted_secrets');
    expect(migration).toContain(
      'Chatwoot Vault secret name already exists with different secret',
    );
    expect(migration).toContain(
      'Chatwoot Vault secret name collision requires reconciliation',
    );
    expect(migration).toContain('chatwoot_vault_find_secret_ref');
  });

  it('never stores plaintext secret in Smart Core mapping or audit tables', () => {
    expect(migration).not.toMatch(
      /insert\s+into\s+public\.(?:audit_logs|chatwoot_[a-z0-9_]+)\s*\([^)]*secret/is,
    );
    expect(runtime).not.toMatch(/console\.(?:log|info|warn|error)/);
    expect(runtime).not.toMatch(/NextResponse|Response\s*\(/);
  });

  it('keeps the runtime behind a server-only Supabase service client', () => {
    expect(runtime).toContain("import 'server-only'");
    expect(runtime).toContain('createSupabaseServiceClient');
    expect(serviceClient).toContain("import 'server-only'");
    expect(serviceClient).toContain('SUPABASE_SECRET_KEY');
    expect(serviceClient).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('uses exact secret-reference parsing in both SQL and TypeScript', () => {
    expect(migration).toContain('secretref://supabase-vault/');
    expect(runtime).toContain('secretref:\\/\\/supabase-vault');
  });

  it('keeps the synthetic Vault bootstrap clearly CI-only', () => {
    expect(bootstrap).toContain('CI-only');
    expect(bootstrap).toContain('does NOT emulate Vault encryption');
    expect(bootstrap).toContain('with (security_invoker = true)');
    expect(bootstrap).not.toMatch(/security\s+definer/i);
  });

  it('keeps the Vault smoke transactional and psql-safe', () => {
    expect(smoke).toMatch(/^begin;/m);
    expect(smoke).toMatch(/^rollback;/m);
    expect(smoke).not.toMatch(/\bdo \$\n/);
    expect(smoke).not.toMatch(/\n\$;\n/);

    const doBlocks = [
      ...smoke.matchAll(/do \$\$([\s\S]*?)\$\$;/g),
    ].map((match) => match[1]);

    for (const block of doBlocks) {
      expect(block).not.toMatch(/:'[A-Za-z0-9_]+'/);
    }
  });
});
