import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  chatwootRoleForSmartRole,
  normalizeChatwootInt32Id,
  normalizeChatwootInt64Id,
  projectedChatwootUserName,
} from '@/lib/chatwoot/tenant-bridge-slice-b';

const migration = fs.readFileSync(
  'supabase/migrations/0078_chatwoot_tenant_bridge_slice_b.sql',
  'utf8',
);
const runtime = fs.readFileSync(
  'lib/chatwoot/tenant-bridge-slice-b.ts',
  'utf8',
);
const route = fs.readFileSync(
  'app/api/chatwoot/tenant-bridge/resources/route.ts',
  'utf8',
);
const serviceClient = fs.readFileSync('lib/supabase/service.ts', 'utf8');
const sqlSmoke = fs.readFileSync(
  'tests/sql/chatwoot-tenant-bridge-slice-b-smoke.sql',
  'utf8',
);

describe('COMM-TENANT-BRIDGE Slice B', () => {
  it('projects Smart roles without giving ADMIN Chatwoot infrastructure administration', () => {
    expect(chatwootRoleForSmartRole('OWNER')).toBe('administrator');
    expect(chatwootRoleForSmartRole('ADMIN')).toBe('agent');
    expect(chatwootRoleForSmartRole('SALES_MANAGER')).toBe('agent');
    expect(chatwootRoleForSmartRole('SALES_AGENT')).toBe('agent');
    expect(chatwootRoleForSmartRole('VIEWER')).toBeNull();

    expect(migration).toContain("effective_smart_role in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT')");
    expect(migration).toContain("OWNER must project to Chatwoot administrator");
    expect(migration).toContain("non-OWNER Smart role must project to Chatwoot agent");
  });

  it('matches verified Chatwoot v4.18.0 external ID widths', () => {
    expect(migration).toMatch(/chatwoot_user_id integer\b/);
    expect(migration).toMatch(/chatwoot_inbox_id integer\b/);
    expect(migration).toMatch(/chatwoot_account_user_id bigint\b/);
    expect(migration).toMatch(/chatwoot_team_id bigint\b/);

    expect(normalizeChatwootInt32Id('2147483647')).toBe(2147483647);
    expect(normalizeChatwootInt32Id('2147483648')).toBeNull();
    expect(normalizeChatwootInt64Id('9223372036854775807')).toBe(
      '9223372036854775807',
    );
    expect(normalizeChatwootInt64Id('9223372036854775808')).toBeNull();
  });

  it('never invents a staff display name from an email local-part', () => {
    expect(
      projectedChatwootUserName({
        email: 'owner@example.com',
        trustedDisplayName: null,
      }),
    ).toBe('owner@example.com');

    expect(
      projectedChatwootUserName({
        email: 'owner@example.com',
        trustedDisplayName: '  Canonical Owner  ',
      }),
    ).toBe('Canonical Owner');

    expect(() =>
      projectedChatwootUserName({ email: '   ', trustedDisplayName: null }),
    ).toThrow('Canonical Smart user email is required');
  });

  it('keeps Slice B mapping tables server-only rather than browser/Data-API writable', () => {
    for (const table of [
      'chatwoot_user_mappings',
      'chatwoot_account_memberships',
      'chatwoot_inbox_mappings',
      'chatwoot_team_mappings',
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }

    expect(migration).toContain('from anon, authenticated, service_role');
    expect(migration).toContain('to service_role');
    expect(migration).not.toMatch(
      /grant\s+(?:select|insert|update|delete)[^;]*\bto\s+authenticated\b/is,
    );
  });

  it('stores only secret references and does not expose them through the read runtime', () => {
    expect(migration).toContain('webhook_secret_ref text');
    expect(migration).toContain('hmac_token_ref text');
    expect(migration).not.toMatch(/\bwebhook_secret\s+text\b/i);
    expect(migration).not.toMatch(/\bhmac_token\s+text\b/i);

    expect(runtime).not.toContain('webhook_secret_ref');
    expect(runtime).not.toContain('hmac_token_ref');
    expect(route).not.toContain('webhook_secret_ref');
    expect(route).not.toContain('hmac_token_ref');
  });

  it('keeps the Supabase service key behind a server-only module', () => {
    expect(serviceClient).toContain("import 'server-only'");
    expect(serviceClient).toContain('SUPABASE_SECRET_KEY');
    expect(serviceClient).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(serviceClient).not.toContain('NEXT_PUBLIC_SUPABASE_SERVICE');
  });

  it('contains no provider/Chatwoot HTTP side effect in Slice B mapping runtime', () => {
    for (const source of [runtime, route]) {
      expect(source).not.toMatch(/\bfetch\s*\(|axios|graph\.facebook|resend\.com/i);
      expect(source).not.toMatch(/send_whatsapp|send_email|platform\/api\/v1/i);
    }
  });

  it('keeps API Inbox secret references out of canonical audit payloads', () => {
    const auditFunction = migration.slice(
      migration.indexOf(
        'create or replace function public.audit_chatwoot_slice_b_mapping_mutation',
      ),
      migration.indexOf(
        'create or replace function public.enforce_tenant_business_chatwoot_bridge_archive',
      ),
    );

    expect(auditFunction).not.toContain('webhook_secret_ref');
    expect(auditFunction).not.toContain('hmac_token_ref');
    expect(migration).not.toContain('chatwoot_user_mappings_audit');
  });

  it('extends hierarchy removal guards rather than leaving active projections orphaned', () => {
    expect(migration).toContain('enforce_department_chatwoot_bridge_archive');
    expect(migration).toContain('enforce_team_chatwoot_bridge_archive');
    expect(migration).toContain('enforce_organization_member_chatwoot_remove');
    expect(migration).toContain(
      'archive Chatwoot Account membership before removing Organization member',
    );
  });

  it('reuses Slice A durable command claims and expands only the allowed command/entity catalog', () => {
    expect(migration).toContain("'CREATE_USER_MAPPING'");
    expect(migration).toContain("'CREATE_ACCOUNT_MEMBERSHIP'");
    expect(migration).toContain("'CREATE_INBOX_MAPPING'");
    expect(migration).toContain("'CREATE_TEAM_MAPPING'");
    expect(migration).not.toContain('create table if not exists public.chatwoot_bridge_command_claims');
  });

  it('uses SECURITY INVOKER only and keeps SQL smoke rollback-only', () => {
    const functions =
      migration.match(/create or replace function public\./gi) ?? [];
    const invokers = migration.match(/security invoker/gi) ?? [];

    expect(migration).not.toMatch(/security\s+definer/i);
    expect(invokers).toHaveLength(functions.length);
    expect(sqlSmoke).toMatch(/^begin;/m);
    expect(sqlSmoke).toMatch(/^rollback;/m);
    expect(sqlSmoke).not.toMatch(/\bdo \$\n/);
    expect(sqlSmoke).not.toMatch(/\n\$;\n/);
  });
});
