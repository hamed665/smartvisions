import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only',()=>({}));

import {
  normalizeWarehouseReadInput,
  normalizeWarehouseSyncInput,
} from '@/lib/analytics/warehouse';

const migration=readFileSync('supabase/migrations/20261004055417_data_warehouse.sql','utf8');
const smoke=readFileSync('tests/sql/data-warehouse-smoke.sql','utf8');
const worker=readFileSync('worker/index.ts','utf8');
const route=readFileSync('app/api/operations/analytics-warehouse/route.ts','utf8');
const heartbeat=readFileSync('app/api/operations/heartbeat/route.ts','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('DATA-WAREHOUSE',()=>{
  it('creates a rebuildable projection warehouse instead of a second event truth',()=>{
    expect(migration).toContain('create table public.analytics_warehouse_facts');
    expect(migration).toContain('create table public.analytics_warehouse_checkpoints');
    expect(migration).toContain('from public.analytics_event_feed_v1');
    expect(migration).toContain('Rebuildable non-authoritative analytics projection');
    expect(migration).not.toMatch(/create table public\.(analytics_events|business_events|event_store|warehouse_events)/i);
  });

  it('keeps facts/checkpoints server-only and security-invoker',()=>{
    expect(migration).toContain('alter table public.analytics_warehouse_facts enable row level security');
    expect(migration).toContain('alter table public.analytics_warehouse_checkpoints enable row level security');
    expect(migration).toContain('to service_role');
    expect(migration).toContain("current_user not in ('service_role','postgres')");
    expect(migration).not.toMatch(/security definer/i);
    expect(smoke).toContain('browser roles must not read warehouse facts directly');
    expect(smoke).toContain('browser roles must not execute warehouse functions');
  });

  it('bounds incremental ingestion, late-event overlap and explicit backfill',()=>{
    expect(migration).toContain("interval '7 days'");
    expect(migration).toContain("interval '31 days'");
    expect(migration).toContain('lookback_seconds integer not null default 172800');
    expect(migration).toContain('least(greatest(coalesce(p_limit,5000),1),5000)');
    expect(migration).toContain('pg_try_advisory_xact_lock');
    expect(smoke).toContain('late event inside lookback was not projected');
    expect(smoke).toContain('explicit warehouse backfill did not project old event');
  });

  it('does not warehouse raw provider or audit evidence blobs',()=>{
    expect(migration).not.toMatch(/\b(payload|raw_evidence|normalized_evidence|before_data|after_data|request_hash)\b\s+(json|jsonb)/i);
    expect(smoke).toContain('warehouse facts expose raw evidence columns');
  });

  it('normalizes sync/backfill inputs deterministically',()=>{
    const value=normalizeWarehouseSyncInput({
      organizationId:'11111111-1111-4111-8111-111111111111',
      endAt:'2026-10-04T00:00:00Z',
      backfillFrom:'2026-10-01T00:00:00Z',
      limit:9000,
    });
    expect(value).toEqual({
      p_organization_id:'11111111-1111-4111-8111-111111111111',
      p_end_at:'2026-10-04T00:00:00.000Z',
      p_backfill_from:'2026-10-01T00:00:00.000Z',
      p_limit:5000,
    });
    expect(()=>normalizeWarehouseSyncInput({
      organizationId:'x',
      endAt:'2026-10-04T00:00:00Z',
      backfillFrom:'2026-08-01T00:00:00Z',
    })).toThrow(/exceeds 31 days/i);
  });

  it('normalizes bounded warehouse reads without arbitrary SQL',()=>{
    const value=normalizeWarehouseReadInput({
      organizationId:'11111111-1111-4111-8111-111111111111',
      startAt:'2026-01-01T00:00:00Z',
      endAt:'2026-10-01T00:00:00Z',
      eventNames:['payment.captured.v1','payment.captured.v1','booking.confirmed.v1'],
      limit:99999,
    });
    expect(value.p_event_names).toEqual(['payment.captured.v1','booking.confirmed.v1']);
    expect(value.p_limit).toBe(10000);
    expect(migration).toContain('Bounded service-only warehouse reader');
    expect(migration).not.toMatch(/execute\s+format\s*\(/i);
  });

  it('reuses Cloudflare Cron and the existing internal-operation boundary',()=>{
    expect(route).toContain('requireInternalApiKey(request)');
    expect(route).toContain("from('system_controls')");
    expect(worker).toContain("'/api/operations/analytics-warehouse'");
    expect(worker).toContain('analyticsWarehouseInserted');
    expect(heartbeat).toContain('analyticsWarehouseInserted');
    expect(migration).not.toMatch(/create\s+extension[\s\S]{0,80}(pg_cron|pgmq)|cron\.schedule|pgmq\./i);
  });

  it('wires PostgreSQL 17 smoke into the authoritative CI chain',()=>{
    expect(ci).toContain('/work/tests/sql/data-warehouse-smoke.sql');
  });
});