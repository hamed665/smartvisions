import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

import {
  PAYMENT_PROVIDER_CATALOG,
  getPaymentProviderDefinition,
  normalizeRegisteredPaymentProvider,
  paymentProviderSupports,
  paymentProviderSupportsCurrency,
} from '../lib/payments/providers/catalog';

const providerRuntime=readFileSync('lib/payments/providers/runtime.ts','utf8');
const providerActions=readFileSync('app/payments/provider-actions.ts','utf8');
const providerPage=readFileSync('app/payments/providers/page.tsx','utf8');
const paymentDetail=readFileSync('app/payments/[id]/page.tsx','utf8');
const paymentCore=readFileSync('supabase/migrations/0178_payment_core.sql','utf8');
const omanRuntime=readFileSync('lib/payments/oman/runtime.ts','utf8');

describe('PAYMENT-EXTENSION contract',()=>{
  it('registers provider capabilities without inventing a second payment authority',()=>{
    expect(PAYMENT_PROVIDER_CATALOG.map(provider=>provider.code)).toEqual(['TAP','THAWANI']);
    expect(new Set(PAYMENT_PROVIDER_CATALOG.map(provider=>provider.code)).size).toBe(PAYMENT_PROVIDER_CATALOG.length);
    for(const provider of PAYMENT_PROVIDER_CATALOG){
      expect(provider.settlementAuthority).toBe('PAYMENT_CORE');
      expect(provider.countries.length).toBeGreaterThan(0);
      expect(provider.currencies.length).toBeGreaterThan(0);
      expect(provider.capabilities).toContain('HOSTED_PAYMENT_LINK');
    }
    expect(providerRuntime).not.toMatch(/create table|payment_extension_(ledger|transaction|refund)|provider_ledger/i);
  });

  it('keeps canonical Payment Core provider identifiers open to future registered adapters',()=>{
    expect(paymentCore).toContain("provider ~ '^[A-Z0-9_-]{2,40}$'");
    expect(paymentCore).not.toMatch(/provider\s+.*check.*\b(TAP|THAWANI)\b/i);
    expect(paymentCore).toContain('record_payment_provider_event_v1');
    expect(paymentCore).toContain('record_payment_link_v1');
    expect(paymentCore).toContain('request_payment_refund_v1');
  });

  it('fails closed for unknown providers and unsupported currency/capability combinations',()=>{
    expect(normalizeRegisteredPaymentProvider(' tap ')).toBe('TAP');
    expect(()=>normalizeRegisteredPaymentProvider('UNREGISTERED_GATEWAY')).toThrow('Unsupported payment provider');
    expect(paymentProviderSupportsCurrency('TAP','OMR')).toBe(true);
    expect(paymentProviderSupportsCurrency('THAWANI','USD')).toBe(false);
    expect(paymentProviderSupports('TAP','PARTIAL_REFUND')).toBe(true);
    expect(paymentProviderSupports('THAWANI','PARTIAL_REFUND')).toBe(false);
  });

  it('routes current providers through one adapter registry while preserving provider-specific protocol code',()=>{
    expect(providerRuntime).toContain('const ADAPTERS:Record<RegisteredPaymentProviderCode,PaymentProviderAdapter>');
    expect(providerRuntime).toContain("createOmanPaymentLink({...input,provider:'TAP'})");
    expect(providerRuntime).toContain("createOmanPaymentLink({...input,provider:'THAWANI'})");
    expect(providerRuntime).toContain('reconcileTapPayment');
    expect(providerRuntime).toContain('reconcileThawaniPayment');
    expect(omanRuntime).toContain("rpc('record_payment_link_v1'");
    expect(omanRuntime).toContain("rpc('record_payment_provider_event_v1'");
  });

  it('makes operator surfaces provider-neutral and catalog-driven',()=>{
    expect(providerActions).toContain('configurePaymentProviderV1');
    expect(providerActions).toContain('createPaymentLinkV1');
    expect(providerActions).toContain('executePaymentRefundV1');
    expect(providerActions).not.toContain("from '@/lib/payments/oman/runtime'");
    expect(providerPage).toContain('listPaymentProviders');
    expect(providerPage).toContain('Provider extension boundary');
    expect(paymentDetail).toContain('paymentProviderSupportsCurrency');
    expect(paymentDetail).toContain('Create Payment Link');
    expect(paymentDetail).not.toContain('Create Oman Payment Link');
  });

  it('declares truthful current-provider capability limits',()=>{
    const tap=getPaymentProviderDefinition('TAP');
    const thawani=getPaymentProviderDefinition('THAWANI');
    expect(tap.countries).toEqual(['OM']);
    expect(tap.currencies).toEqual(['OMR']);
    expect(tap.capabilities).toContain('VERIFIED_WEBHOOK');
    expect(tap.capabilities).toContain('PARTIAL_REFUND');
    expect(thawani.countries).toEqual(['OM']);
    expect(thawani.currencies).toEqual(['OMR']);
    expect(thawani.capabilities).toContain('SERVER_READBACK');
    expect(thawani.capabilities).not.toContain('PARTIAL_REFUND');
  });
});
