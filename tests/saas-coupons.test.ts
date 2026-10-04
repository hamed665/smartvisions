import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261004182500_saas_coupons.sql',
  'utf8',
);
const billing = readFileSync('lib/saas/billing.ts', 'utf8');
const coupons = readFileSync('lib/saas/coupons.ts', 'utf8');
const route = readFileSync('app/api/saas/coupons/route.ts', 'utf8');
const page = readFileSync('app/coupons/page.tsx', 'utf8');
const billingPage = readFileSync('app/billing/page.tsx', 'utf8');
const shell = readFileSync('app/app-shell.tsx', 'utf8');

describe('SAAS-COUPONS architecture', () => {
  it('extends the canonical platform billing ledger without creating pricing or payment truth', () => {
    expect(migration).toContain('create table public.saas_coupons');
    expect(migration).toContain('create table public.saas_coupon_scopes');
    expect(migration).toContain('create table public.saas_coupon_targets');
    expect(migration).toContain('create table public.saas_coupon_redemptions');
    expect(migration).not.toContain('create table public.subscriptions');
    expect(migration).not.toContain('create table public.pricing_versions');
    expect(migration).not.toContain('insert into public.invoices');
    expect(migration).not.toContain('insert into public.payment_intents');
    expect(migration).not.toContain('insert into public.payment_transactions');
  });

  it('supports fixed, percentage, free-setup and trial benefits with bounded scopes', () => {
    expect(migration).toContain("('FIXED','PERCENTAGE','FREE_SETUP','TRIAL')");
    expect(migration).toContain("('ALL','COMPONENT','METER_PREFIX')");
    expect(migration).toContain("'SETUP','PLATFORM','FEATURE','CHANNEL','SEAT'");
    expect(migration).toContain("'AI_USAGE','THIRD_PARTY_USAGE','OVERAGE'");
    expect(migration).toContain("meter_prefix ~ '^(FEATURE|CHANNEL|ADDON|API|STORAGE|OVERAGE)");
    expect(migration).toContain('trial_periods between 1 and 12');
    expect(migration).toContain("currency ~ '^[A-Z]{3}$'");
    expect(migration).toContain("v_currency !~ '^[A-Z]{3}$'");
    expect(migration).toContain('TRIAL must target the full billing statement');
  });

  it('uses canonical tenant, plan, pricing and subscription constraints', () => {
    expect(migration).toContain("('ORGANIZATION','PLAN','PRICING_VERSION','SUBSCRIPTION')");
    expect(migration).toContain("target_type='ORGANIZATION'");
    expect(migration).toContain("target_type='PLAN'");
    expect(migration).toContain("target_type='PRICING_VERSION'");
    expect(migration).toContain("target_type='SUBSCRIPTION'");
    expect(migration).toContain('Organization target is not eligible');
    expect(migration).toContain('Plan target is not eligible');
    expect(migration).toContain('Pricing Version target is not eligible');
    expect(migration).toContain('Subscription target is not eligible');
  });

  it('writes immutable coupon evidence into the existing billing DISCOUNT boundary', () => {
    expect(migration).toContain("'DISCOUNT','CREDIT','COUPON.'||c.code");
    expect(migration).toContain("'SAAS_COUPON_REDEMPTION'");
    expect(migration).toContain('recalculate_saas_billing_draft_v1');
    expect(migration).toContain("component='TAX'");
    expect(migration).toContain('(v_subtotal-v_discount)+v_tax');
    expect(migration).toContain('redemption evidence is immutable');
    expect(migration).toContain('discount line evidence is immutable');
    expect(migration).toContain('SAAS-COUPONS is the only DISCOUNT line authority');
    expect(migration).toContain('discount line does not match immutable redemption evidence');
    expect(migration).toContain('stacking is not enabled for this billing version');
  });

  it('keeps collection outside coupons and uses a real issuer for audit evidence', () => {
    expect(migration).toContain('issuer_organization_id uuid not null');
    expect(migration).toContain("'paymentCollectionExecuted',false");
    expect(migration).toContain("'SAAS_COUPON_CREATED'");
    expect(migration).toContain("'SAAS_COUPON_ACTIVATED'");
    expect(migration).toContain("'SAAS_COUPON_REDEEMED'");
  });

  it('keeps browser mutation commands closed', () => {
    expect(migration).toContain('create_saas_coupon_v1');
    expect(migration).toContain('activate_saas_coupon_v1');
    expect(migration).toContain('apply_saas_coupon_to_statement_v1');
    expect(migration).toContain('from public,anon,authenticated');
    expect(migration).toContain('to service_role');
    expect(migration).toContain("current_user<>'service_role'");
  });
});

describe('SAAS-COUPONS read surfaces', () => {
  it('exposes only OWNER/ADMIN no-store evidence reads', () => {
    expect(route).toContain("['OWNER', 'ADMIN']");
    expect(route).toContain('loadSaasCouponOverview');
    expect(route).toContain("'Cache-Control': 'private, no-store, max-age=0'");
    expect(page).toContain('Coupon evidence is limited to Organization OWNER/ADMIN roles.');
    expect(coupons).toContain("authority: 'AVAILABLE'");
    expect(coupons).toContain("stackingPolicy: 'ONE_COUPON_PER_STATEMENT'");
  });

  it('connects billing readiness and app navigation to the canonical coupon authority', () => {
    expect(billing).toContain("couponAuthority: 'AVAILABLE'");
    expect(billingPage).toContain('Available via SAAS-COUPONS');
    expect(shell).toContain("['Coupons', '/coupons']");
  });
});
