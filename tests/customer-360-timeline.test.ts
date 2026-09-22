import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  isTimelineItemId,
  normalizeTimelineCursor,
} from '@/lib/crm/customer-timeline';

const migration = readFileSync(
  new URL('../supabase/migrations/0071_customer_360_timeline.sql', import.meta.url),
  'utf8',
);
const route = readFileSync(
  new URL('../app/api/crm/customer-timeline/route.ts', import.meta.url),
  'utf8',
);
const runtime = readFileSync(
  new URL('../lib/crm/customer-timeline.ts', import.meta.url),
  'utf8',
);

describe('Business OS Customer 360 timeline', () => {
  it('validates deterministic timeline item IDs', () => {
    expect(isTimelineItemId(
      'conversation_message:40000000-0000-0000-0000-000000000c01',
    )).toBe(true);
    expect(isTimelineItemId(
      'operator_brief:b0000000-0000-0000-0000-000000000c01',
    )).toBe(true);
    expect(isTimelineItemId('whatsapp_events:abc')).toBe(false);
    expect(isTimelineItemId('conversation_message:not-a-uuid')).toBe(false);
  });

  it('normalizes a two-part cursor and rejects malformed cursor data', () => {
    expect(normalizeTimelineCursor({
      occurredAt: '2026-09-22T10:00:00Z',
      itemId: 'outreach_message:50000000-0000-0000-0000-000000000c02',
    })).toEqual({
      occurredAt: '2026-09-22T10:00:00.000Z',
      itemId: 'outreach_message:50000000-0000-0000-0000-000000000c02',
    });

    expect(normalizeTimelineCursor({
      occurredAt: 'not-a-date',
      itemId: 'outreach_message:50000000-0000-0000-0000-000000000c02',
    })).toBeNull();
  });

  it('uses a SECURITY INVOKER view instead of a copied event store', () => {
    expect(migration).toContain('create or replace view public.crm_customer_timeline');
    expect(migration).toContain('with (security_invoker = true)');
    expect(migration).not.toContain('create table public.crm_customer_timeline');
    expect(migration).not.toContain('create materialized view');
  });

  it('keeps provider journals as enrichment instead of standalone timeline rows', () => {
    expect(migration).toContain('latest_provider_status');
    expect(migration).toContain("from public.whatsapp_events");
    expect(migration).toContain("from public.email_events");
    expect(migration).not.toContain("'whatsapp_events'::text as source");
    expect(migration).not.toContain("'email_events'::text as source");
  });

  it('deduplicates actual outreach against canonical conversation messages', () => {
    expect(migration).toContain('where not exists');
    expect(migration).toContain('cm.provider_message_id = om.provider_message_id');
    expect(migration).toContain("cm.status = 'SENT'");
  });

  it('does not expose unsent drafts as customer interactions', () => {
    expect(migration).toContain("when cm.status = 'BLOCKED' then 'MESSAGE_BLOCKED'");
    expect(migration).toContain("then 'CUSTOMER'");
    expect(migration).toContain("else 'INTERNAL'");
  });

  it('uses SECURITY INVOKER for deterministic paginated timeline access', () => {
    expect(migration).toContain('create or replace function public.get_crm_customer_timeline');
    expect(migration).toContain('security invoker');
    expect(migration).not.toContain('security definer');
    expect(migration).toContain('t.occurred_at = p_before_at');
    expect(migration).toContain('t.item_id < p_before_item_id');
  });

  it('uses signed-in Supabase session and RLS in the API route', () => {
    expect(route).toContain("import { createClient } from '@/lib/supabase/server'");
    expect(route).toContain('supabase.auth.getUser()');
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(route).not.toContain('SUPABASE_SECRET_KEY');
  });

  it('adds no provider send path to Customer 360 timeline', () => {
    const combined = migration + route + runtime;
    expect(combined).not.toContain('MetaCloudWhatsAppProvider');
    expect(combined).not.toContain('ResendEmailProvider');
    expect(combined).not.toMatch(/send(?:Email|Text|Template)\s*\(/);
  });
});
