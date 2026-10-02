import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

import {mapTapEvent,omrToBaisa,tapHashInput,verifyTapHashstring} from '../lib/payments/oman/provider';
import {shouldBypassSession} from '../lib/supabase/proxy';

const migration=readFileSync('supabase/migrations/0179_payment_oman.sql','utf8');
const runtime=readFileSync('lib/payments/oman/runtime.ts','utf8');
const config=readFileSync('lib/payments/oman/config.ts','utf8');
const tapRoute=readFileSync('app/api/payments/oman/tap/webhook/route.ts','utf8');
const tapReturn=readFileSync('app/api/payments/oman/tap/return/route.ts','utf8');
const thawaniRoute=readFileSync('app/api/payments/oman/thawani/reconcile/route.ts','utf8');
const providerActions=readFileSync('app/payments/provider-actions.ts','utf8');
const providerPage=readFileSync('app/payments/providers/page.tsx','utf8');
const paymentDetail=readFileSync('app/payments/[id]/page.tsx','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('PAYMENT-OMAN contract',()=>{
  it('extends canonical Payment Core without a provider-specific ledger or refund authority',()=>{
    expect(migration).toContain('configure_oman_payment_provider_v1');
    expect(migration).toContain('record_oman_payment_provider_health_v1');
    expect(migration).not.toMatch(/create table public\.(tap|thawani|payment_provider_connection|payment_oman_transaction|payment_oman_refund)/i);
    expect(runtime).toContain("rpc('record_payment_link_v1'");
    expect(runtime).toContain("rpc('record_payment_provider_event_v1'");
    expect(runtime).toContain("rpc('mark_payment_intent_reconciliation_required_v1'");
  });

  it('stores gateway credentials only in canonical Supabase Vault and keeps references in integration_connections',()=>{
    expect(migration).toContain('vault.create_secret');
    expect(migration).toContain('vault.update_secret');
    expect(migration).toContain("'secret_key_ref'");
    expect(migration).toContain("'publishable_key_ref'");
    expect(migration).toContain("provider=v_provider and channel='PAYMENT'");
    expect(migration).not.toMatch(/create table public\..*(credential|secret|vault)/i);
    expect(config).toContain("rpc('integration_vault_read_secret'");
    expect(providerPage).toContain('never displays stored keys');
  });

  it('separates configured readiness from verified provider connectivity',()=>{
    expect(migration).toContain("'READY'");
    expect(migration).toContain("case when p_healthy then 'CONNECTED' else 'DEGRADED' end");
    expect(migration).toContain("'providerConnected',false");
    expect(runtime).toContain('recordOmanProviderHealth');
  });

  it('validates Tap hashstring before verified webhook settlement',()=>{
    const payload={
      id:'chg_test_1',amount:1.25,currency:'OMR',status:'CAPTURED',object:'charge',
      reference:{gateway:'gw_1',payment:'pay_1'},transaction:{created:'1700000000000'},
    };
    const secret='sk_test_contract_only';
    const hash=createHmac('sha256',secret).update(tapHashInput(payload),'utf8').digest('hex');
    expect(verifyTapHashstring(payload,hash,secret)).toBe(true);
    expect(verifyTapHashstring(payload,'00'.repeat(32),secret)).toBe(false);
    expect(tapRoute).toContain("p_authenticity:'VERIFIED_WEBHOOK'");
    expect(tapRoute.indexOf('verifyTapHashstring')).toBeLessThan(tapRoute.indexOf("record_payment_provider_event_v1"));
  });

  it('keeps gateway callbacks public while operator payment pages remain session protected',()=>{
    expect(shouldBypassSession('/api/payments/oman/tap/webhook')).toBe(true);
    expect(shouldBypassSession('/api/payments/oman/tap/return')).toBe(true);
    expect(shouldBypassSession('/api/payments/oman/thawani/reconcile')).toBe(true);
    expect(shouldBypassSession('/payments/providers')).toBe(false);
    expect(shouldBypassSession('/payments/00000000-0000-0000-0000-000000000000')).toBe(false);
    expect(runtime).toContain("/api/payments/oman/tap/return?payment_intent_id=");
    expect(runtime).toContain("/api/payments/oman/thawani/reconcile?payment_intent_id=");
    expect(tapReturn).toContain("provider:'TAP'");
    expect(tapReturn).toContain('Payment status pending');
    expect(thawaniRoute).toContain('Payment status pending');
    expect(tapReturn).not.toContain("'/payments/");
    expect(thawaniRoute).not.toContain("NextResponse.redirect");
  });

  it('uses authenticated provider readback for Thawani instead of trusting an unsigned callback',()=>{
    expect(thawaniRoute).toContain("provider:'THAWANI'");
    expect(runtime).toContain("p_authenticity:'EXPLICIT_RECONCILIATION'");
    expect(runtime).toContain('retrieveThawaniSession');
    expect(thawaniRoute).not.toContain("VERIFIED_WEBHOOK");
  });

  it('normalizes OMR minor units and terminal Tap outcomes safely',()=>{
    expect(omrToBaisa(1)).toBe(1000);
    expect(omrToBaisa(1.234)).toBe(1234);
    expect(()=>omrToBaisa(1.2345)).toThrow();
    expect(mapTapEvent({object:'charge',status:'CAPTURED',amount:4})).toEqual({kind:'CAPTURED',amount:4});
    expect(mapTapEvent({object:'refund',status:'ACCEPTED',amount:4})).toBeNull();
    expect(mapTapEvent({object:'refund',status:'REFUNDED',amount:4})).toEqual({kind:'REFUNDED',amount:4});
  });

  it('exposes governed operator surfaces and controlled PostgreSQL acceptance',()=>{
    expect(providerActions).toContain('configurePaymentProviderV1');
    expect(providerActions).toContain('createPaymentLinkV1');
    expect(providerActions).toContain('executePaymentRefundV1');
    expect(paymentDetail).toContain('Create Payment Link');
    expect(paymentDetail).toContain('settlement remains evidence-gated');
    expect(ci).toContain('payment-oman-smoke.sql');
  });
});
