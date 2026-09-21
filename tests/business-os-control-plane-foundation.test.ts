import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertCanonicalTenantScope,
  canMutateControlPlane,
  customerAiChargeMultiplier,
  effectiveRoleForScope,
  isCatalogTransitionAllowed,
  isSubscriptionTransitionAllowed,
  resolveEntitlement,
  resolveFeatureFlag,
  resolveScopedValue,
  type TenantScope,
} from '@/lib/business-os/control-plane';

const migration = readFileSync(
  new URL('../supabase/migrations/0068_business_os_control_plane_foundation.sql', import.meta.url),
  'utf8',
);

const target: TenantScope = {
  organizationId: 'org-a',
  brandId: 'brand-a',
  tenantBusinessId: 'business-a',
  branchId: 'branch-a',
  departmentId: 'department-a',
  teamId: 'team-a',
};

describe('Business OS control plane runtime contracts', () => {
  it('requires an unbroken canonical scope chain', () => {
    expect(() => assertCanonicalTenantScope({ organizationId: 'org-a', branchId: 'branch-a' }))
      .toThrow('tenantBusinessId is required');
    expect(assertCanonicalTenantScope(target)).toEqual(target);
  });

  it('resolves configuration from organization to the most specific matching scope', () => {
    expect(resolveScopedValue({
      target,
      legacyOrganizationValue: 'legacy',
      overrides: [
        { organizationId: 'org-a', scopeType: 'ORGANIZATION', value: 'org' },
        { organizationId: 'org-a', scopeType: 'BRAND', scopeId: 'brand-a', value: 'brand' },
        { organizationId: 'org-a', scopeType: 'BUSINESS', scopeId: 'business-a', value: 'business' },
        { organizationId: 'org-a', scopeType: 'TEAM', scopeId: 'team-a', value: 'team' },
        { organizationId: 'org-b', scopeType: 'TEAM', scopeId: 'team-a', value: 'cross-tenant' },
      ],
    })).toBe('team');
  });

  it('never applies an override from another tenant', () => {
    expect(resolveScopedValue({
      target,
      legacyOrganizationValue: 'safe',
      overrides: [
        { organizationId: 'org-b', scopeType: 'ORGANIZATION', value: 'wrong' },
        { organizationId: 'org-b', scopeType: 'TEAM', scopeId: 'team-a', value: 'also-wrong' },
      ],
    })).toBe('safe');
  });

  it('resolves feature flags with the same deterministic scope precedence', () => {
    expect(resolveFeatureFlag({
      target,
      defaultEnabled: false,
      overrides: [
        { organizationId: 'org-a', scopeType: 'ORGANIZATION', value: true },
        { organizationId: 'org-a', scopeType: 'BRANCH', scopeId: 'branch-a', value: false },
        { organizationId: 'org-a', scopeType: 'TEAM', scopeId: 'team-a', value: true },
      ],
    })).toBe(true);
  });

  it('keeps authenticated control-plane mutation owner-only', () => {
    expect(canMutateControlPlane('OWNER')).toBe(true);
    expect(canMutateControlPlane('ADMIN')).toBe(false);
    expect(canMutateControlPlane('SALES_MANAGER')).toBe(false);
    expect(canMutateControlPlane('SALES_AGENT')).toBe(false);
    expect(canMutateControlPlane('VIEWER')).toBe(false);
  });

  it('uses the most specific applicable scoped role without narrowing organization OWNER', () => {
    expect(effectiveRoleForScope({
      organizationRole: 'VIEWER',
      userId: 'user-a',
      target,
      assignments: [
        {
          organizationId: 'org-a',
          userId: 'user-a',
          scopeType: 'BRAND',
          scopeId: 'brand-a',
          role: 'SALES_AGENT',
        },
        {
          organizationId: 'org-a',
          userId: 'user-a',
          scopeType: 'TEAM',
          scopeId: 'team-a',
          role: 'SALES_MANAGER',
        },
      ],
    })).toBe('SALES_MANAGER');

    expect(effectiveRoleForScope({
      organizationRole: 'OWNER',
      userId: 'user-a',
      target,
      assignments: [{
        organizationId: 'org-a',
        userId: 'user-a',
        scopeType: 'TEAM',
        scopeId: 'team-a',
        role: 'VIEWER',
      }],
    })).toBe('OWNER');
  });

  it('never applies another user scoped assignment', () => {
    expect(effectiveRoleForScope({
      organizationRole: 'VIEWER',
      userId: 'user-a',
      target,
      assignments: [{
        organizationId: 'org-a',
        userId: 'user-b',
        scopeType: 'TEAM',
        scopeId: 'team-a',
        role: 'ADMIN',
      }],
    })).toBe('VIEWER');
  });

  it('gives an active entitlement override precedence over the plan value', () => {
    const at = new Date('2026-09-22T00:00:00Z');
    expect(resolveEntitlement({
      planValue: 10,
      at,
      overrides: [
        { value: 20, validFrom: '2026-09-01T00:00:00Z', validTo: '2026-10-01T00:00:00Z' },
      ],
    })).toBe(20);

    expect(resolveEntitlement({
      planValue: 10,
      at,
      overrides: [
        { value: 99, validFrom: '2026-08-01T00:00:00Z', validTo: '2026-09-01T00:00:00Z' },
      ],
    })).toBe(10);
  });

  it('charges AI only for BILLABLE usage and keeps excluded classes at zero', () => {
    expect(customerAiChargeMultiplier('BILLABLE')).toBe(4);
    for (const classification of [
      'NON_BILLABLE',
      'SYSTEM_RETRY',
      'CACHED',
      'PROMOTIONAL',
      'INTERNAL',
    ] as const) {
      expect(customerAiChargeMultiplier(classification)).toBe(0);
    }
  });

  it('mirrors catalog and subscription state-machine guards', () => {
    expect(isCatalogTransitionAllowed('DRAFT', 'ACTIVE')).toBe(true);
    expect(isCatalogTransitionAllowed('ACTIVE', 'RETIRED')).toBe(true);
    expect(isCatalogTransitionAllowed('RETIRED', 'ACTIVE')).toBe(false);

    expect(isSubscriptionTransitionAllowed('TRIAL', 'ACTIVE')).toBe(true);
    expect(isSubscriptionTransitionAllowed('ACTIVE', 'PAST_DUE')).toBe(true);
    expect(isSubscriptionTransitionAllowed('PAST_DUE', 'ACTIVE')).toBe(true);
    expect(isSubscriptionTransitionAllowed('PAST_DUE', 'GRACE_PERIOD')).toBe(true);
    expect(isSubscriptionTransitionAllowed('GRACE_PERIOD', 'SUSPENDED')).toBe(true);
    expect(isSubscriptionTransitionAllowed('SUSPENDED', 'CANCELED')).toBe(true);
    expect(isSubscriptionTransitionAllowed('SUSPENDED', 'EXPIRED')).toBe(true);
    expect(isSubscriptionTransitionAllowed('CANCELED', 'EXPIRED')).toBe(false);
    expect(isSubscriptionTransitionAllowed('EXPIRED', 'ACTIVE')).toBe(false);
  });
});

describe('Business OS control plane migration safety', () => {
  it('does not repurpose the existing CRM/Hunter businesses table', () => {
    expect(migration).not.toMatch(/alter\s+table\s+public\.businesses/i);
    expect(migration).toContain('create table if not exists public.tenant_businesses');
  });

  it('enforces organization-consistent hierarchy foreign keys', () => {
    expect(migration).toContain('foreign key (organization_id, brand_id)');
    expect(migration).toContain('references public.brands(organization_id, id)');
    expect(migration).toContain('foreign key (organization_id, tenant_business_id)');
    expect(migration).toContain('references public.tenant_businesses(organization_id, id)');
    expect(migration).toContain('foreign key (organization_id, branch_id)');
    expect(migration).toContain('references public.branches(organization_id, id)');
    expect(migration).toContain('foreign key (organization_id, department_id)');
    expect(migration).toContain('references public.departments(organization_id, id)');
  });

  it('ties scoped user access back to the existing organization membership', () => {
    expect(migration).toContain('references public.organization_members(organization_id, user_id)');
    expect(migration).toContain("scope_type text not null check (scope_type in ('BRAND','BUSINESS','BRANCH','DEPARTMENT','TEAM'))");
    expect(migration).toContain("role text not null check (role in ('ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER'))");
    expect(migration).not.toContain("role text not null check (role in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER'))");
  });

  it('enables RLS on every new tenant-owned table', () => {
    for (const table of [
      'brands',
      'tenant_businesses',
      'branches',
      'departments',
      'teams',
      'member_scope_assignments',
      'scope_configuration_overrides',
      'feature_flag_overrides',
      'subscriptions',
      'organization_entitlement_overrides',
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security;`);
    }
  });

  it('keeps hierarchy/config mutations owner-gated and subscriptions tenant-read-only', () => {
    expect(migration).toContain('with check (public.is_org_owner(organization_id))');
    expect(migration).toContain('create policy subscriptions_member_read on public.subscriptions');
    expect(migration).toContain('grant select on public.plans');
    expect(migration).not.toContain('subscriptions_owner_insert');
  });

  it('fails customer billing closed while preserving the raw Cost Guard ledger', () => {
    expect(migration).toContain("usage_classification text not null default 'INTERNAL'");
    expect(migration).toContain("'BILLABLE'");
    expect(migration).toContain("'SYSTEM_RETRY'");
    expect(migration).toContain("'CACHED'");
    expect(migration).toContain("'PROMOTIONAL'");
    expect(migration).toContain("'NON_BILLABLE'");
    expect(migration).toContain('revoke insert on table public.usage_events from authenticated;');
    expect(migration).toContain('create or replace function public.classify_usage_event(');
    expect(migration).toContain('grant execute on function public.classify_usage_event');
    expect(migration).toContain('to service_role;');
    expect(migration).not.toContain('grant update (usage_classification) on table public.usage_events to authenticated;');
    expect(migration).not.toMatch(/alter\s+column\s+cost_usd/i);
  });

  it('extends canonical audit logs and audits important control-plane mutations', () => {
    expect(migration).toContain('add column if not exists correlation_id text');
    expect(migration).toContain('add column if not exists causation_id text');
    expect(migration).toContain('audit_logs_business_scope_fk');
    expect(migration).toContain('audit_logs_team_scope_fk');
    expect(migration).toContain('create or replace function public.audit_control_plane_mutation()');
    expect(migration).toContain('member_scope_assignments_audit_mutation');
    expect(migration).toContain('subscriptions_audit_mutation');
  });

  it('protects runtime safety flags from generic configuration overrides', () => {
    for (const reservedKey of [
      'shadow_mode',
      'global_kill_switch',
      'email_paused',
      'whatsapp_ai_paused',
      'agents_paused',
    ]) {
      expect(migration).toContain(`'${reservedKey}'`);
    }
  });

  it('pins the current customer AI multiplier policy to exactly 4x', () => {
    expect(migration).toContain("ai_cost_multiplier numeric(10,4) not null default 4 check (ai_cost_multiplier = 4)");
  });

  it('uses the canonical subscription state catalog without invented aliases', () => {
    expect(migration).toContain("status text not null check (status in ('TRIAL','ACTIVE','PAST_DUE','GRACE_PERIOD','SUSPENDED','CANCELED','EXPIRED'))");
    expect(migration).not.toContain("'TRIALING'");
    expect(migration).not.toContain("'PAUSED'");
  });

  it('makes published pricing immutable and entitlements draft-only', () => {
    expect(migration).toContain('create or replace function public.enforce_pricing_version_immutability()');
    expect(migration).toContain('pricing_versions_immutability_guard');
    expect(migration).toContain('create or replace function public.enforce_plan_entitlement_draft_only()');
    expect(migration).toContain('plan_entitlements_draft_guard');
  });

  it('keeps every PL/pgSQL body correctly dollar quoted', () => {
    const singleDollar = String.fromCharCode(36);
    const newline = String.fromCharCode(10);
    expect(migration).not.toContain('as ' + singleDollar + newline);
    expect(migration).not.toContain(newline + singleDollar + ';' + newline);
  });

  it('adds formal state-machine guards without provider actions', () => {
    expect(migration).toContain('create or replace function public.enforce_subscription_state_transition()');
    expect(migration).toContain('subscriptions_state_transition_guard');
    expect(migration).toContain('pricing_versions_state_transition_guard');
    expect(migration).not.toMatch(/net\.http|http_post|resend\.com|graph\.facebook|send_whatsapp/i);
  });
});
