import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CRM_ACCOUNT_HIERARCHY_RELATIONS,
  CRM_ACCOUNT_LIFECYCLES,
  CRM_ACCOUNT_MUTATION_ROLES,
  isCrmAccountHierarchyRelation,
  isCrmAccountLifecycle,
  isCrmAccountMutationRole,
} from '@/lib/crm/accounts';

describe('CRM-ACCOUNT-V2 governance', () => {
  const migration = readFileSync('supabase/migrations/0130_crm_account_v2_governance.sql', 'utf8');
  const api = readFileSync('app/api/crm/accounts/route.ts', 'utf8');
  const list = readFileSync('app/accounts/page.tsx', 'utf8');
  const detail = readFileSync('app/accounts/[id]/page.tsx', 'utf8');
  const actions = readFileSync('app/accounts/[id]/account-actions.tsx', 'utf8');
  const shell = readFileSync('app/app-shell.tsx', 'utf8');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

  it('extends canonical businesses instead of creating a second Account store', () => {
    expect(migration).toContain('alter table public.businesses');
    expect(migration).not.toMatch(/create table if not exists public\.crm_accounts\b/i);
    expect(migration).not.toMatch(/create table public\.crm_accounts\b/i);
    expect(migration).toContain('tenant_businesses / branches remain the tenant');
  });

  it('does not infer lifecycle, ownership or hierarchy for existing Companies', () => {
    expect(migration).toContain("account_lifecycle text not null default 'UNCLASSIFIED'");
    expect(migration).not.toMatch(/update public\.businesses\s+set\s+account_lifecycle\s*=\s*'PROSPECT'/i);
    expect(migration).not.toMatch(/update public\.businesses\s+set\s+account_owner_user_id/i);
  });

  it('governs lifecycle and external Account hierarchy with deterministic contracts', () => {
    expect(CRM_ACCOUNT_LIFECYCLES).toEqual([
      'UNCLASSIFIED','PROSPECT','QUALIFIED','CUSTOMER','FORMER_CUSTOMER','PARTNER','ARCHIVED',
    ]);
    expect(CRM_ACCOUNT_HIERARCHY_RELATIONS).toEqual(['BRANCH_OF','SUBSIDIARY_OF','DIVISION_OF']);
    expect(isCrmAccountLifecycle('CUSTOMER')).toBe(true);
    expect(isCrmAccountHierarchyRelation('BRANCH_OF')).toBe(true);
    expect(migration).toContain('CRM Account hierarchy would create a cycle');
    expect(migration).toContain('parent_business_id <> id');
  });

  it('uses narrow Account governance roles while allowing Sales Agents as assignees', () => {
    expect(CRM_ACCOUNT_MUTATION_ROLES).toEqual(['OWNER','ADMIN','SALES_MANAGER']);
    expect(isCrmAccountMutationRole('SALES_AGENT')).toBe(false);
    expect(migration).toContain("v_owner_role not in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT')");
  });

  it('protects governed fields from legacy direct browser updates', () => {
    expect(migration).toContain('guard_crm_account_governance');
    expect(migration).toContain("current_user <> 'service_role'");
    expect(migration).toContain('CRM Account governance requires the trusted server boundary');
  });

  it('keeps mutation RPCs service-only and reads authenticated', () => {
    for (const fn of [
      'set_crm_account_owner_manual',
      'set_crm_account_lifecycle_manual',
      'set_crm_account_parent_manual',
    ]) {
      expect(migration).toContain(`grant execute on function public.${fn}`);
    }
    expect(migration).toContain('grant execute on function public.get_crm_account_v2(uuid, uuid, integer)\n  to authenticated');
    expect(migration).not.toMatch(/security definer/i);
  });

  it('keeps audit evidence bounded instead of copying raw operator reason/evidence', () => {
    expect(migration).toContain("'reason_present', true");
    expect(migration).toContain("'evidence_present', true");
    expect(migration).toContain('octet_length(p_evidence::text) > 8192');
  });

  it('exposes Account list/detail and governed operator actions', () => {
    expect(shell).toContain("['Accounts', '/accounts']");
    expect(list).toContain('Canonical external Companies');
    expect(detail).toContain('Internal tenant businesses and branches remain separate');
    expect(actions).toContain("action: 'SET_LIFECYCLE'");
    expect(actions).toContain("action: 'SET_OWNER'");
    expect(actions).toContain("action: 'SET_PARENT'");
    expect(api).toContain('createSupabaseServiceClient()');
  });

  it('runs a dedicated PostgreSQL 17 Account governance smoke', () => {
    expect(ci).toContain('crm-account-v2-governance-smoke.sql');
  });
});
