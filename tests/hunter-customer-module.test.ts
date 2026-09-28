import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/0146_hunter_customer_module_read_model.sql','utf8');
const page = readFileSync('app/hunters/customer-module/page.tsx','utf8');
const hunters = readFileSync('app/hunters/page.tsx','utf8');
const ci = readFileSync('.github/workflows/ci.yml','utf8');

describe('HUNTER-CUSTOMER-MODULE composition contract', () => {
  it('extends existing authorities without a second Prospect or credit store', () => {
    expect(migration).toContain('get_hunter_customer_summary');
    expect(migration).toContain('get_hunter_customer_prospects');
    expect(migration).toContain('security invoker');
    expect(migration).not.toMatch(/create\s+table/i);
    expect(migration).not.toMatch(/create\s+materialized\s+view/i);
    expect(migration).not.toMatch(/insert\s+into/i);
  });

  it('uses canonical usage, entitlement, CRM, qualification and suppression evidence', () => {
    expect(migration).toContain('public.usage_events');
    expect(migration).toContain('public.plan_entitlements');
    expect(migration).toContain('public.organization_entitlement_overrides');
    expect(migration).toContain('public.growth_opportunities');
    expect(migration).toContain('public.crm_deals');
    expect(migration).toContain('public.suppression_list');
    expect(migration).toContain('false as contactability_is_permission');
  });

  it('keeps ROI observational and refuses to turn discovery into permission', () => {
    expect(page).toContain('Contactability ≠ permission');
    expect(page).toContain('does not claim Hunter caused the Deal');
    expect(page).toContain('does not invent a separate balance');
    expect(page).toContain('cannot send a message');
  });

  it('ships the module from the existing Hunter surface and PostgreSQL gate', () => {
    expect(hunters).toContain('/hunters/customer-module');
    expect(ci).toContain('hunter-customer-module-smoke.sql');
  });
});
