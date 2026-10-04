import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only',()=>({}));

import { normalizeAnalyticsEventRead } from '@/lib/analytics/metrics';

const migration=readFileSync('supabase/migrations/20261004001135_data_event_metrics.sql','utf8');
const smoke=readFileSync('tests/sql/data-event-metrics-smoke.sql','utf8');

describe('DATA-EVENT-METRICS',()=>{
  it('uses one versioned Metrics Registry and no second business-event table',()=>{
    expect(migration).toContain('create table public.metric_definitions');
    expect(migration).not.toMatch(/create table public\.(analytics_events|metric_events|event_feed|warehouse_events)/i);
    expect(migration).toContain('unique(metric_key,version)');
    expect(migration).toContain('metric_definitions_one_active_key_uidx');
    expect(migration).toContain("status in ('ACTIVE','RETIRED')");
  });

  it('projects a security-invoker feed from canonical OLTP evidence without raw payloads',()=>{
    expect(migration).toContain('create view public.analytics_event_feed_v1');
    expect(migration).toContain('with (security_invoker=true)');
    expect(migration).toContain('from public.audit_logs');
    expect(migration).toContain('from public.booking_lifecycle_events');
    expect(migration).toContain('from public.quote_lifecycle_events');
    expect(migration).toContain('from public.order_lifecycle_events');
    expect(migration).toContain('from public.invoice_lifecycle_events');
    expect(migration).toContain('from public.payment_provider_events');
    expect(migration).toContain('from public.usage_events');
    expect(migration).toContain('from public.whatsapp_events');
    expect(migration).toContain('from public.email_events');
    expect(migration).not.toMatch(/select[\s\S]{0,120}\b(raw_evidence|normalized_evidence|before_data|after_data|payload)\b/i);
  });

  it('keeps the event feed server-only and bounded',()=>{
    expect(migration).toContain('grant select on table public.analytics_event_feed_v1 to service_role');
    expect(migration).toContain("current_user not in ('service_role','postgres')");
    expect(migration).toContain("interval '31 days'");
    expect(migration).toContain('least(greatest(coalesce(p_limit,1000),1),5000)');
    expect(migration).toContain('cardinality(p_event_names)>64');
    expect(smoke).toContain('browser roles must not execute bounded analytics reader');
  });

  it('defines safe monetary metrics that cannot collapse currencies',()=>{
    expect(migration).toContain("'payment.captured.amount'");
    expect(migration).toContain("'payment.refunded.amount'");
    expect(migration).toContain('"requiredDimensions":["currency"]');
    expect(migration).toContain('"crossCurrencyAggregation":false');
    expect(smoke).toContain('money metric permits unsafe cross-currency aggregation');
  });

  it('does not claim causality in seeded metric definitions',()=>{
    const causalMatches=migration.match(/"causal":false/g)??[];
    expect(causalMatches.length).toBeGreaterThanOrEqual(18);
    expect(migration).not.toContain('"causal":true');
  });

  it('normalizes bounded event reads deterministically',()=>{
    const normalized=normalizeAnalyticsEventRead({
      organizationId:'11111111-1111-4111-8111-111111111111',
      startAt:'2026-10-01T00:00:00Z',
      endAt:'2026-10-02T00:00:00Z',
      eventNames:['booking.confirmed.v1','booking.confirmed.v1','payment.captured.v1'],
      tenantBusinessId:'22222222-2222-4222-8222-222222222222',
      branchId:'33333333-3333-4333-8333-333333333333',
      limit:9000,
    });
    expect(normalized.p_event_names).toEqual(['booking.confirmed.v1','payment.captured.v1']);
    expect(normalized.p_limit).toBe(5000);
    expect(normalized.p_start_at).toBe('2026-10-01T00:00:00.000Z');
    expect(normalized.p_end_at).toBe('2026-10-02T00:00:00.000Z');
  });

  it('rejects reversed and oversized read windows',()=>{
    expect(()=>normalizeAnalyticsEventRead({
      organizationId:'x',
      startAt:'2026-10-02T00:00:00Z',
      endAt:'2026-10-01T00:00:00Z',
    })).toThrow(/window is invalid/i);

    expect(()=>normalizeAnalyticsEventRead({
      organizationId:'x',
      startAt:'2026-08-01T00:00:00Z',
      endAt:'2026-10-01T00:00:00Z',
    })).toThrow(/exceeds 31 days/i);
  });
});