import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  normalizeChatwootAccountId,
  normalizeChatwootErrorCode,
  normalizeRequestKey,
} from '@/lib/chatwoot/tenant-bridge';

const migration = fs.readFileSync(
  'supabase/migrations/0077_chatwoot_tenant_bridge_slice_a.sql',
  'utf8',
);
const runtime = fs.readFileSync('lib/chatwoot/tenant-bridge.ts', 'utf8');
const route = fs.readFileSync('app/api/chatwoot/tenant-bridge/route.ts', 'utf8');
const sqlSmoke = fs.readFileSync(
  'tests/sql/chatwoot-tenant-bridge-slice-a-smoke.sql',
  'utf8',
);

describe('COMM-TENANT-BRIDGE Slice A', () => {
  it('keeps the canonical tenant Business separate from Growth/Hunter businesses', () => {
    expect(migration).toContain('references public.tenant_businesses(organization_id, id)');
    expect(migration).not.toContain('references public.businesses');
  });

  it('limits initial provider lanes to proven Email and WhatsApp channels', () => {
    expect(migration).toContain("check (channel in ('EMAIL','WHATSAPP'))");
    expect(runtime).toContain("export type CommunicationChannel = 'EMAIL' | 'WHATSAPP'");
  });

  it('keeps provider credentials and sends out of Slice A', () => {
    expect(migration).not.toMatch(/access_token|api_key|smtp_password|provider_secret/i);
    expect(runtime).not.toMatch(/graph\.facebook|resend\.com|fetch\(|axios|send_whatsapp|send_email/i);
    expect(route).not.toMatch(/graph\.facebook|resend\.com|fetch\(|axios|send_whatsapp|send_email/i);
  });

  it('requires governed command RPCs for bridge mutations', () => {
    expect(migration).toContain('enforce_chatwoot_bridge_command_path');
    expect(migration).toContain("current_setting('smartvisions.chatwoot_bridge_command', true)");
    expect(migration).toContain("set_config('smartvisions.chatwoot_bridge_command', '1', true)");
    expect(migration).toContain("set_config('smartvisions.chatwoot_bridge_command', '0', true)");
    expect(migration).toContain('Chatwoot bridge rows use lifecycle state; DELETE is not permitted');
  });

  it('uses immutable durable command claims instead of mutable last-key-only idempotency', () => {
    expect(migration).toContain('create table if not exists public.chatwoot_bridge_command_claims');
    expect(migration).toContain('create or replace function public.claim_chatwoot_bridge_command');
    expect(migration).toContain('payload_hash');
    expect(migration).toContain('extensions.digest(jsonb_build_object(');
    expect(migration).toContain("'sha256'");
    expect(migration).not.toMatch(/\bmd5\(/i);
    expect(migration).toContain('request key already used with different Chatwoot bridge payload');
    expect(migration).toContain('Chatwoot bridge command claims are immutable');
    expect(migration).toContain('chatwoot_bridge_command_claims_insert_guard');
    expect(migration).not.toContain('chatwoot_bridge_command_claims_audit');
  });

  it('keeps writes OWNER-only and infrastructure reads OWNER/ADMIN', () => {
    expect(migration).toContain("m.role = 'OWNER'");
    expect(migration).toContain("m.role in ('OWNER','ADMIN')");
    expect(migration).toContain('communication_channel_bindings_owner_insert');
    expect(migration).toContain('chatwoot_account_mappings_owner_update');
  });

  it('uses explicit grants because Data API auto-exposure is not assumed', () => {
    expect(migration).toContain('revoke all on table public.chatwoot_bridge_command_claims');
    expect(migration).toContain('grant select, insert on table public.chatwoot_bridge_command_claims');
    expect(migration).toContain('grant select, insert, update on table public.communication_channel_bindings');
    expect(migration).toContain('grant select on table public.chatwoot_bridge_command_claims');
    expect(migration).not.toMatch(/grant\s+update[^;]*chatwoot_bridge_command_claims/is);
    expect(migration).not.toMatch(/grant\s+delete[^;]*chatwoot_bridge_command_claims/is);
  });

  it('enforces one live Chatwoot Account mapping per tenant Business', () => {
    expect(migration).toContain('chatwoot_account_mappings_one_live_per_business');
    expect(migration).toContain("where status in ('PROVISIONING','ACTIVE','DEGRADED')");
    expect(migration).toContain('Chatwoot Account ID is immutable once adopted');
    expect(migration).toContain('ARCHIVED Chatwoot Account mapping is terminal');
  });

  it('does not allow one active provider lane to bind to two Businesses', () => {
    expect(migration).toContain('communication_channel_bindings_one_active_per_connection');
    expect(migration).toContain("where status = 'ACTIVE'");
  });

  it('prevents hierarchy archive from orphaning active communication mappings', () => {
    expect(migration).toContain('enforce_tenant_business_chatwoot_bridge_archive');
    expect(migration).toContain('enforce_branch_chatwoot_bridge_archive');
    expect(migration).toContain('archive Chatwoot bridge resources before tenant Business');
    expect(migration).toContain('archive communication binding before Branch');
  });

  it('does not fabricate channel verification timestamps without external evidence', () => {
    const createBinding = migration.slice(
      migration.indexOf('create or replace function public.create_communication_channel_binding'),
      migration.indexOf('create or replace function public.set_communication_channel_binding_lifecycle'),
    );
    const setBindingLifecycle = migration.slice(
      migration.indexOf('create or replace function public.set_communication_channel_binding_lifecycle'),
      migration.indexOf('create or replace function public.create_chatwoot_account_mapping'),
    );

    expect(createBinding).not.toContain('last_verified_at');
    expect(setBindingLifecycle).not.toContain('last_verified_at =');
  });

  it('keeps audit payload bounded and avoids message/provider secrets', () => {
    expect(migration).toContain('COMMUNICATION_CHANNEL_BINDING_CREATED');
    expect(migration).toContain('CHATWOOT_ACCOUNT_MAPPING_ACTIVATED');
    expect(migration).not.toContain("'message_body'");
    expect(migration).not.toContain("'access_token'");
  });

  it('keeps every database function SECURITY INVOKER', () => {
    expect(migration).not.toMatch(/security\s+definer/i);
    expect((migration.match(/security invoker/gi) ?? []).length)
      .toBe((migration.match(/create or replace function public\./gi) ?? []).length);
  });

  it('normalizes request keys and safe Chatwoot scalar evidence', () => {
    expect(normalizeRequestKey('  key-1  ')).toBe('key-1');
    expect(normalizeRequestKey('')).toBeNull();
    expect(normalizeChatwootErrorCode(' upstream_timeout ')).toBe('UPSTREAM_TIMEOUT');
    expect(normalizeChatwootErrorCode('not allowed!')).toBeNull();
    expect(normalizeChatwootAccountId('101')).toBe(101);
    expect(normalizeChatwootAccountId(101)).toBe(101);
    expect(normalizeChatwootAccountId('0')).toBeNull();
    expect(normalizeChatwootAccountId('2147483648')).toBeNull();
  });

  it('contains no malformed single-dollar PL/pgSQL terminator', () => {
    expect(migration).not.toMatch(/\n\$;\n/);
    expect(sqlSmoke).not.toMatch(/\bdo \$\n/);
    expect(sqlSmoke).not.toMatch(/\n\$;\n/);
  });
});
