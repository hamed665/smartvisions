import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SEGMENT-SNAPSHOT immutable audience contract', () => {
  const migration = readFileSync('supabase/migrations/0137_segment_snapshot.sql', 'utf8');
  const runtime = readFileSync('lib/crm/segments.ts', 'utf8');
  const api = readFileSync('app/api/crm/segments/snapshots/route.ts', 'utf8');
  const panel = readFileSync('app/segments/segment-snapshot-panel.tsx', 'utf8');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

  it('creates a dedicated immutable snapshot authority without a second Segment engine', () => {
    expect(migration).toContain('create table if not exists public.crm_segment_snapshots');
    expect(migration).toContain('create table if not exists public.crm_segment_snapshot_members');
    expect(migration).not.toMatch(/create table if not exists public\.crm_segment_rules/i);
    expect(migration).not.toMatch(/create table if not exists public\.segments_v3/i);
    expect(migration).toContain('references public.crm_segment_versions');
  });

  it('freezes exact semantic version, entity type, predicate hash and membership hash', () => {
    expect(migration).toContain('segment_version integer not null');
    expect(migration).toContain('predicate_hash text not null');
    expect(migration).toContain('membership_hash text not null');
    expect(migration).toContain('entity_id uuid not null');
    expect(migration).toContain('validate_crm_segment_snapshot_integrity');
  });

  it('keeps creation service-bound and reads authenticated/RLS-governed', () => {
    expect(migration).toContain('current_user<>\'service_role\'');
    expect(migration).toContain('to service_role;');
    expect(migration).toContain('crm_segment_snapshots_member_read');
    expect(migration).toContain('crm_segment_snapshot_members_member_read');
    expect(migration).toContain('grant select on public.crm_segment_snapshots to authenticated');
    expect(migration).not.toContain('grant insert on public.crm_segment_snapshots to authenticated');
    expect(api).toContain('createSupabaseServiceClient()');
  });

  it('bounds snapshot size and does not treat membership as send permission', () => {
    expect(migration).toContain('limit 10001');
    expect(migration).toContain('exceeds the 10000-member RC safety limit');
    expect(panel).toContain('it is not consent');
    expect(panel).toContain('does not send messages or trigger workflows');
  });

  it('stores bounded audit evidence without raw member IDs', () => {
    const auditStart = migration.indexOf("'CRM_SEGMENT_SNAPSHOT_CREATED'");
    const auditBlock = migration.slice(auditStart, auditStart + 1800);
    expect(auditBlock).toContain("'member_count'");
    expect(auditBlock).toContain("'membership_hash'");
    expect(auditBlock).not.toContain("'entity_ids'");
    expect(auditBlock).not.toContain("'member_ids'");
  });

  it('exposes exact member pagination for historical reproduction', () => {
    expect(runtime).toContain('listCrmSegmentSnapshotMembers');
    expect(api).toContain('listCrmSegmentSnapshotMembers');
    expect(api).toContain('nextCursor');
  });

  it('hard-blocks mutation of snapshot evidence', () => {
    expect(migration).toContain('CRM Segment Snapshot evidence is immutable');
    expect(migration).toContain('before update or delete on public.crm_segment_snapshots');
    expect(migration).toContain('before update or delete on public.crm_segment_snapshot_members');
  });

  it('runs dedicated PostgreSQL 17 snapshot smoke', () => {
    expect(ci).toContain('crm-segment-snapshot-smoke.sql');
  });
});
