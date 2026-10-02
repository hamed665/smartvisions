import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const migration=readFileSync('supabase/migrations/0178_payment_core.sql','utf8');
const runtime=readFileSync('lib/automation/runtime.ts','utf8');
const customer360=readFileSync('lib/crm/customer360.ts','utf8');
const paymentPage=readFileSync('app/payments/page.tsx','utf8');
const paymentDetail=readFileSync('app/payments/[id]/page.tsx','utf8');
const invoiceDetail=readFileSync('app/invoices/[id]/page.tsx','utf8');
const shell=readFileSync('app/app-shell.tsx','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('PAYMENT-CORE contract',()=>{
  it('creates one provider-neutral payment/refund authority without replacing commercial or SaaS billing truth',()=>{
    for(const marker of [
      'create table public.payment_intents',
      'create table public.payment_links',
      'create table public.payment_refunds',
      'create table public.payment_provider_events',
      'create table public.payment_transactions',
    ]) expect(migration).toContain(marker);
    expect(migration).not.toMatch(/create table public\.(invoices|orders|quotes|subscriptions|usage_events|billing_ledger|outbox)/i);
    expect(migration).not.toMatch(/create table public\.(tap|thawani)|tap_secret|thawani_secret|api[.]tap|api[.]thawani/i);
    expect(migration).not.toMatch(/cron\.schedule|pgmq\.|create extension.*pg_cron/i);
  });

  it('keeps provider acceptance, settlement, refund and commercial Credit Notes separate',()=>{
    expect(migration).toContain('A link is not proof of payment success');
    expect(migration).toContain("'EXPLICIT_RECONCILIATION'");
    expect(migration).toContain("'VERIFIED_WEBHOOK'");
    expect(migration).toContain('provider event replay conflict');
    expect(migration).toContain('capture would over-settle Invoice');
    expect(migration).toContain('Refund means money movement');
    expect(migration).toContain("'creditNoteCreated',false");
  });

  it('makes Invoice paid_total a governed net settlement projection only',()=>{
    expect(migration).toContain("current_setting('app.payment_core_projection'");
    expect(migration).toContain("set paid_total=paid_total+p_amount");
    expect(migration).toContain("set paid_total=paid_total-p_amount");
    expect(migration).toContain('Payment Intent exceeds current Invoice balance');
    expect(migration).toContain('Credit Note conflicts with unresolved Payment Intent reservation');
  });

  it('hardens idempotency, ambiguity and direct mutation boundaries',()=>{
    expect(migration).toContain('payment_intents_one_unresolved_per_invoice_uidx');
    expect(migration).toContain('unique (organization_id,provider,provider_event_id)');
    expect(migration).toContain('RECONCILIATION_REQUIRED');
    expect(migration).toContain('record_payment_provider_event_v1');
    expect(migration).toContain("current_user<>'service_role'");
    expect(migration).toContain('enable row level security');
  });

  it('activates Payment automation through the existing runtime and extends Customer 360',()=>{
    expect(migration).toContain("where trigger_key in ('PAYMENT_INTENT','PAYMENT_CAPTURED','PAYMENT_FAILED','PAYMENT_REFUNDED')");
    expect(migration).toContain('reconcile_payment_automation_events');
    expect(runtime).toContain("'reconcile_payment_automation_events'");
    expect(migration).toContain('get_crm_customer360_v6');
    expect(migration).toContain('get_crm_customer360_v5');
    expect(customer360).toContain("rpc('get_crm_customer360_v6'");
    expect(customer360).toContain("rpc('get_crm_customer360_v5'");
  });

  it('exposes governed Business Web payment surfaces without pretending a provider is active',()=>{
    expect(shell).toContain("['Payments', '/payments']");
    expect(paymentPage).toContain('Canonical payment intents');
    expect(paymentDetail).toContain('Provider evidence');
    expect(paymentDetail).toContain('Refund');
    expect(invoiceDetail).toContain('PaymentIntentForm');
    expect(invoiceDetail).toContain('Payment Core');
  });

  it('runs controlled PostgreSQL 17 Payment acceptance in CI',()=>{
    expect(ci).toContain('payment-core-smoke.sql');
  });
});
