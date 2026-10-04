import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { summarizeBillingFormula, type SaasBillingStatement } from '@/lib/saas/billing';

const migration = readFileSync(
  'supabase/migrations/20261004152500_saas_billing.sql',
  'utf8',
);
const route = readFileSync('app/api/saas/billing/route.ts', 'utf8');
const page = readFileSync('app/billing/page.tsx', 'utf8');
const shell = readFileSync('app/app-shell.tsx', 'utf8');

function statement(): SaasBillingStatement {
  return {
    id: 's1',
    subscriptionId: 'sub1',
    pricingVersionId: 'pv1',
    periodStart: '2026-10-01T00:00:00.000Z',
    periodEnd: '2026-11-01T00:00:00.000Z',
    status: 'FINALIZED',
    currency: 'OMR',
    setupTotal: 10,
    platformTotal: 20,
    featureTotal: 5,
    channelTotal: 2,
    seatTotal: 3,
    aiUsageTotal: 4,
    thirdPartyUsageTotal: 1,
    overageTotal: 6,
    discountTotal: 7,
    taxTotal: 2.2,
    subtotal: 51,
    total: 46.2,
    finalizedAt: '2026-11-01T00:00:01.000Z',
    createdAt: '2026-11-01T00:00:00.000Z',
    lines: [],
  };
}

describe('SAAS-BILLING formula projection', () => {
  it('keeps every approved billing component explicit', () => {
    expect(summarizeBillingFormula(statement())).toEqual({
      setup: 10,
      platform: 20,
      features: 5,
      channels: 2,
      seats: 3,
      aiUsage: 4,
      thirdPartyUsage: 1,
      overage: 6,
      discounts: 7,
      tax: 2.2,
      total: 46.2,
    });
  });
});

describe('SAAS-BILLING architecture', () => {
  it('creates one platform ledger without reusing tenant invoice/payment truth', () => {
    expect(migration).toContain('create table public.saas_billing_statements');
    expect(migration).toContain('create table public.saas_billing_line_items');
    expect(migration).toContain('create table public.saas_billing_profiles');
    expect(migration).not.toContain('insert into public.invoices');
    expect(migration).not.toContain('insert into public.payment_intents');
    expect(migration).not.toContain('insert into public.payment_transactions');
  });

  it('bills only governed BILLABLE usage and preserves the fixed AI multiplier', () => {
    expect(migration).toContain("ue.usage_classification='BILLABLE'");
    expect(migration).toContain("ue.provider='OPENAI'");
    expect(migration).toContain('v_billable_ai_usd*pv.ai_cost_multiplier*v_rate');
    expect(migration).toContain("'AI.RAW_COST_USD'");
    expect(migration).toContain("'THIRD_PARTY.RAW_COST_USD'");
    expect(migration).toContain('includedAiRawCostUsd');
    expect(migration).toContain('includedThirdPartyRawCostUsd');
    expect(migration).toContain("'markupApplied',false");
  });

  it('supports seats, channels, feature/add-on and metered overage evidence', () => {
    expect(migration).toContain("'SEATS'::text as meter_key");
    expect(migration).toContain("'CHANNEL.'||upper(b.channel)");
    expect(migration).toContain("upper(e.feature_key) like 'FEATURE.%'");
    expect(migration).toContain("upper(e.feature_key) like 'ADDON.%'");
    expect(migration).toContain("ue.metadata->>'billingUnitKey'");
  });

  it('keeps discount authority pending for SAAS-COUPONS instead of inventing discounts', () => {
    expect(migration).toContain("'discountAuthority','SAAS_COUPONS_PENDING'");
    expect(migration).toContain("component='DISCOUNT'");
    expect(migration).not.toContain('create table public.saas_coupons');
  });

  it('keeps payment collection outside the billing ledger side effect', () => {
    expect(migration).toContain("'paymentCollectionExecuted',false");
    expect(page).toContain('Payment collection');
    expect(page).toContain('Not activated by billing ledger');
  });

  it('hardens statement tenant/pricing/profile source evidence even inside trusted writes', () => {
    expect(migration).toContain('statement subscription/pricing tenant evidence is inconsistent');
    expect(migration).toContain('statement billing-profile currency evidence is inconsistent');
    expect(migration).toContain('statement source evidence is immutable');
  });

  it('exposes billing only to OWNER/ADMIN and links the dedicated surface', () => {
    expect(route).toContain("['OWNER', 'ADMIN']");
    expect(route).toContain('loadSaasBillingOverview');
    expect(route).toContain("'Cache-Control': 'private, no-store, max-age=0'");
    expect(shell).toContain("['Billing', '/billing']");
  });
});
