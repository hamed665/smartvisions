import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/20261004094009_data_attribution_v2.sql','utf8');
const smoke=readFileSync('tests/sql/data-attribution-v2-smoke.sql','utf8');
const page=readFileSync('app/marketing-attribution/page.tsx','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('DATA-ATTRIBUTION V2',()=>{
  it('extends the read model without a second persisted attribution truth',()=>{
    expect(migration).toContain('get_observational_attribution_v2');
    expect(migration).not.toMatch(/create\s+table/i);
    expect(migration).not.toMatch(/create\s+materialized\s+view/i);
    expect(migration).not.toMatch(/insert\s+into/i);
    expect(migration).toContain('security invoker');
    expect(migration).toContain('get_marketing_attribution');
  });

  it('supports only timestamped canonical downstream outcomes',()=>{
    for(const outcome of [
      'DEAL_WON','BOOKING_COMPLETED','QUOTE_ACCEPTED','ORDER_FULFILLED','PAYMENT_CAPTURED',
    ])expect(migration).toContain(`'${outcome}'`);
    expect(migration).toContain("e.transition='COMPLETED'");
    expect(migration).toContain("e.transition='ACCEPTED'");
    expect(migration).toContain("e.transition='FULFILLED'");
    expect(migration).toContain("pt.transaction_type='CAPTURED'");
  });

  it('uses immutable payment money movement rather than payment state or webhook payloads',()=>{
    expect(migration).toContain('from public.payment_transactions pt');
    expect(migration).toContain("'COLLECTED_MONEY'::text");
    expect(migration).toContain('true as collected_money_evidence');
    expect(migration).not.toContain('raw_evidence');
    expect(migration).not.toContain('normalized_evidence');
    expect(page).toContain('Immutable PAYMENT-CORE transaction only');
  });

  it('requires explicit lead linkage and rejects conflicting Deal/Booking identity',()=>{
    expect(migration).toContain('oc.deal_lead_id<>oc.booking_lead_id');
    expect(migration).toContain('pc.deal_lead_id<>pc.booking_lead_id');
    expect(migration).toContain("else 'UNRESOLVED'");
    expect(smoke).toContain('fabricated Payment attribution without exact Lead linkage');
  });

  it('keeps all attribution observational and preserves V1 compatibility',()=>{
    expect(migration).toContain('false as causal_claim');
    expect(migration).toContain("('FIRST_TOUCH','LAST_TOUCH','LINEAR')");
    expect(smoke).toContain('broke V1 Marketing Attribution compatibility');
    expect(page).toContain('Observational credit');
    expect(page).toContain('Deal amount is sales evidence, not payment or revenue');
  });

  it('bounds models, lookback and outcome count before campaign fan-out',()=>{
    expect(migration).toContain('p_lookback_days>180');
    expect(migration).toContain('p_limit>500');
    expect(migration).toContain('bounded_outcomes');
    expect(migration).toContain('limit p_limit');
    expect(smoke).toContain('LINEAR credit is not exactly 10000 bps');
  });

  it('does not claim UTM, referrer, click or fuzzy identity evidence',()=>{
    expect(page).toContain('UTM, referrer and advertising click IDs are not used');
    expect(page).toContain('fuzzy cross-channel matching');
    expect(migration).not.toMatch(/gclid|fbclid|ttclid|msclkid|utm_/i);
  });

  it('wires controlled PostgreSQL acceptance after Booking lifecycle fixtures',()=>{
    const booking=ci.indexOf('/work/tests/sql/booking-lifecycle-smoke.sql');
    const attribution=ci.indexOf('/work/tests/sql/data-attribution-v2-smoke.sql');
    expect(booking).toBeGreaterThan(-1);
    expect(attribution).toBeGreaterThan(booking);
    expect(smoke).toContain('BOOKING_COMPLETED');
    expect(smoke).toContain('PAYMENT_CAPTURED');
  });
});