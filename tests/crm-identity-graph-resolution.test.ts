import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CRM_IDENTITY_RESOLUTION_ROLES,
  isCrmIdentityResolutionRole,
} from '@/lib/crm/identity-graph';

describe('CRM-IDENTITY-GRAPH governed resolution', () => {
  const migration = readFileSync('supabase/migrations/0128_crm_identity_graph_resolution.sql', 'utf8');
  const route = readFileSync('app/api/crm/identity-graph/route.ts', 'utf8');
  const runtime = readFileSync('lib/crm/identity-graph.ts', 'utf8');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

  it('reuses canonical identity and Person authorities', () => {
    expect(migration).toContain('public.crm_identities');
    expect(migration).toContain('public.crm_identity_links');
    expect(migration).toContain('public.crm_people');
    expect(migration).toContain('public.crm_person_identity_links');
    expect(migration).not.toContain('create table if not exists public.crm_identity_graph');
    expect(migration).not.toContain('create table if not exists public.crm_contacts');
  });

  it('surfaces deterministic conflict evidence without fuzzy matching', () => {
    expect(migration).toContain('list_crm_identity_resolution_candidates');
    expect(migration).toContain('person_ids uuid[]');
    expect(migration).toContain('business_ids uuid[]');
    expect(migration).toContain("'PERSON_CONFLICT'");
    expect(migration).toContain("'PERSON_AND_BUSINESS_CONFLICT'");
    expect(migration).toContain("'VERIFIED'");
    const executableSql = migration
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(executableSql).not.toMatch(/levenshtein|similarity\(/i);
  });

  it('keeps manual resolution roles narrow', () => {
    expect(CRM_IDENTITY_RESOLUTION_ROLES).toEqual(['OWNER', 'ADMIN', 'SALES_MANAGER']);
    expect(isCrmIdentityResolutionRole('OWNER')).toBe(true);
    expect(isCrmIdentityResolutionRole('SALES_AGENT')).toBe(false);
    expect(isCrmIdentityResolutionRole('VIEWER')).toBe(false);
  });

  it('supports governed merge, split and unlink through the server-only authority', () => {
    for (const fn of [
      'merge_crm_people_manual',
      'split_crm_person_identity_manual',
      'unlink_crm_person_identity_manual',
    ]) {
      expect(migration).toContain(`create or replace function public.${fn}`);
    }
    expect(route).toContain("['MERGE', 'SPLIT', 'UNLINK']");
    expect(route).toContain('createSupabaseServiceClient()');
    expect(runtime).toContain("service.rpc('merge_crm_people_manual'");
    expect(runtime).toContain("service.rpc('split_crm_person_identity_manual'");
    expect(runtime).toContain("service.rpc('unlink_crm_person_identity_manual'");
  });

  it('fails closed instead of orphaning an active Person', () => {
    expect(migration).toContain('CRM Person split would leave source Person without an active identity');
    expect(migration).toContain('CRM Person unlink would leave Person without an active identity');
  });

  it('bounds evidence and emits explicit resolution audit events', () => {
    expect(migration).toContain('octet_length(p_evidence::text) > 8192');
    expect(route).toContain('JSON.stringify(evidence).length > 8192');
    expect(migration).toContain('CRM_PERSON_MANUAL_MERGE');
    expect(migration).toContain('CRM_PERSON_MANUAL_SPLIT');
    expect(migration).toContain('CRM_PERSON_IDENTITY_MANUAL_UNLINK');
    expect(migration).not.toContain("'manual_merge_reason', trim(p_reason)\n    ),\n    'dbtx:'");
  });

  it('keeps trusted mutations service-role-only and SECURITY INVOKER', () => {
    expect(migration).toContain('security invoker');
    expect(migration).toContain('grant execute on function public.merge_crm_people_manual');
    expect(migration).toContain('grant execute on function public.split_crm_person_identity_manual');
    expect(migration).toContain('grant execute on function public.unlink_crm_person_identity_manual');
    expect(migration).toContain('to service_role;');
    expect(migration).not.toMatch(/grant execute on function public\.(merge_crm_people_manual|split_crm_person_identity_manual|unlink_crm_person_identity_manual)[\s\S]*?to authenticated;/);
  });

  it('exposes an operator review surface over the governed API', () => {
    const page = readFileSync('app/identity-review/page.tsx', 'utf8');
    const client = readFileSync('app/identity-review/resolution-client.tsx', 'utf8');
    const shell = readFileSync('app/app-shell.tsx', 'utf8');
    expect(page).toContain('listCrmIdentityResolutionCandidates');
    expect(page).toContain('CRM identity conflicts');
    expect(client).toContain("fetch('/api/crm/identity-graph'");
    expect(client).toContain("action: 'MERGE'");
    expect(client).toContain("action: 'SPLIT'");
    expect(client).toContain("action: 'UNLINK'");
    expect(shell).toContain("['Identity Review', '/identity-review']");
  });

  it('runs the dedicated PostgreSQL smoke in CI', () => {
    expect(ci).toContain('crm-identity-graph-resolution-smoke.sql');
  });
});
