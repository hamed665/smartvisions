import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  normalizeSaasEntitlementValue,
  saasEntitlementAllows,
} from '@/lib/saas/entitlements';

const migration = readFileSync(
  'supabase/migrations/20261004145500_saas_plans_entitlements.sql',
  'utf8',
);
const route = readFileSync('app/api/saas/entitlements/route.ts', 'utf8');

describe('SAAS-PLANS-ENTITLEMENTS value contract', () => {
  it('normalizes boolean, limit and set entitlement values', () => {
    expect(normalizeSaasEntitlementValue({ kind: 'BOOLEAN', enabled: true }))
      .toEqual({ kind: 'BOOLEAN', enabled: true });

    expect(normalizeSaasEntitlementValue({ kind: 'LIMIT', unit: 'seats', limit: 5 }))
      .toEqual({ kind: 'LIMIT', unit: 'SEATS', limit: 5 });

    expect(normalizeSaasEntitlementValue({ kind: 'LIMIT', unit: 'api_requests', unlimited: true }))
      .toEqual({ kind: 'LIMIT', unit: 'API_REQUESTS', unlimited: true });

    expect(normalizeSaasEntitlementValue({ kind: 'SET', values: ['whatsapp', 'email'] }))
      .toEqual({ kind: 'SET', values: ['WHATSAPP', 'EMAIL'] });
  });

  it('fails closed for malformed or ambiguous values', () => {
    expect(() => normalizeSaasEntitlementValue({ kind: 'LIMIT', unit: 'SEATS', limit: -1 }))
      .toThrow(/invalid/i);
    expect(() => normalizeSaasEntitlementValue({ kind: 'LIMIT', unit: 'SEATS', limit: 1, unlimited: true }))
      .toThrow(/invalid/i);
    expect(() => normalizeSaasEntitlementValue({ kind: 'SET', values: ['EMAIL', 'email'] }))
      .toThrow(/invalid/i);
    expect(() => normalizeSaasEntitlementValue({ enabled: true }))
      .toThrow(/invalid/i);
  });

  it('evaluates grants deterministically', () => {
    expect(saasEntitlementAllows({ kind: 'BOOLEAN', enabled: true })).toBe(true);
    expect(saasEntitlementAllows({ kind: 'BOOLEAN', enabled: false })).toBe(false);
    expect(saasEntitlementAllows({ kind: 'LIMIT', unit: 'SEATS', limit: 5 }, 5)).toBe(true);
    expect(saasEntitlementAllows({ kind: 'LIMIT', unit: 'SEATS', limit: 5 }, 6)).toBe(false);
    expect(saasEntitlementAllows({ kind: 'LIMIT', unit: 'STORAGE_GB', unlimited: true }, 999999)).toBe(true);
    expect(saasEntitlementAllows({ kind: 'SET', values: ['EMAIL', 'WHATSAPP'] }, 'whatsapp')).toBe(true);
    expect(saasEntitlementAllows({ kind: 'SET', values: ['EMAIL'] }, 'WHATSAPP')).toBe(false);
    expect(saasEntitlementAllows(undefined, 1)).toBe(false);
  });
});

describe('SAAS-PLANS-ENTITLEMENTS architecture', () => {
  it('uses the existing canonical Control Plane authorities', () => {
    expect(migration).toContain('public.plans');
    expect(migration).toContain('public.pricing_versions');
    expect(migration).toContain('public.plan_entitlements');
    expect(migration).toContain('public.subscriptions');
    expect(migration).toContain('public.organization_entitlement_overrides');
    expect(migration).not.toContain('create table public.saas_');
    expect(migration).not.toContain('create table public.entitlement_');
    expect(migration).not.toContain('create table public.billing_');
  });

  it('registers all six canonical plan identities without inventing pricing', () => {
    for (const code of ['STARTER', 'GROWTH', 'PRO', 'BUSINESS', 'AGENCY', 'ENTERPRISE']) {
      expect(migration).toContain(`('${code}'`);
    }
    expect(migration).toContain("'commercialActivation','PENDING_SAAS_BILLING'");
    expect(migration).not.toContain('insert into public.pricing_versions');
    expect(migration).not.toContain('insert into public.subscriptions');
  });

  it('keeps entitlement precedence canonical and tenant-scoped', () => {
    expect(migration).toContain('get_effective_saas_entitlements');
    expect(migration).toContain("if current_user='authenticated'");
    expect(migration).toContain('public.is_org_member(p_organization_id)');
    expect(migration).toContain("case when o.id is not null then 'OVERRIDE:'||o.source_type else 'PLAN' end");
  });

  it('exposes only an authenticated read surface', () => {
    expect(route).toContain('getCurrentOrganization');
    expect(route).toContain('loadSaasEntitlementSnapshot');
    expect(route).toContain("'Cache-Control': 'private, no-store, max-age=0'");
  });
});
