import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeCrmTaskCursor } from '@/lib/crm/tasks';

const migration = readFileSync(
  new URL('../supabase/migrations/0072_crm_task_foundation.sql', import.meta.url),
  'utf8',
);
const route = readFileSync(
  new URL('../app/api/crm/tasks/route.ts', import.meta.url),
  'utf8',
);
const runtime = readFileSync(
  new URL('../lib/crm/tasks.ts', import.meta.url),
  'utf8',
);

describe('Business OS CRM task foundation', () => {
  it('normalizes deterministic task cursors', () => {
    expect(normalizeCrmTaskCursor({
      updatedAt: '2026-09-23T01:00:00Z',
      id: '10000000-0000-0000-0000-000000000c01',
    })).toEqual({
      updatedAt: '2026-09-23T01:00:00.000Z',
      id: '10000000-0000-0000-0000-000000000c01',
    });

    expect(normalizeCrmTaskCursor({
      updatedAt: 'bad-date',
      id: '10000000-0000-0000-0000-000000000c01',
    })).toBeNull();
  });

  it('adds one actionable task source of truth without cloning activity stores', () => {
    expect(migration).toContain('create table if not exists public.crm_tasks');
    expect(migration).not.toContain('create table if not exists public.crm_activities');
    expect(migration).not.toContain('create table if not exists public.task_events');
    expect(migration).not.toContain('create materialized view');
  });

  it('enforces tenant-consistent Business -> Lead -> Conversation lineage', () => {
    expect(migration).toContain(
      'foreign key (organization_id, lead_id, business_id)',
    );
    expect(migration).toContain(
      'foreign key (organization_id, conversation_id, lead_id)',
    );
    expect(migration).toContain(
      'foreign key (organization_id, assignee_user_id)',
    );
  });

  it('uses a formal task lifecycle and no DELETE path', () => {
    expect(migration).toContain(
      "status in ('OPEN','IN_PROGRESS','BLOCKED','DONE','CANCELED')",
    );
    expect(migration).toContain("'CANCELED CRM task is terminal'");
    expect(migration).toContain("old.status = 'DONE'");
    expect(migration).not.toContain('grant delete on public.crm_tasks');
  });

  it('keeps historical source provenance immutable and user-created tasks MANUAL', () => {
    expect(migration).toContain("'CRM task source is immutable'");
    expect(migration).toContain("source_type = 'MANUAL'");
    expect(migration).toContain('source_id is null');
  });

  it('uses authenticated RLS and preserves least privilege', () => {
    expect(migration).toContain('alter table public.crm_tasks enable row level security');
    expect(migration).toContain('crm_tasks_member_read');
    expect(migration).toContain('crm_tasks_manager_insert');
    expect(migration).toContain('crm_tasks_manager_update');
    expect(migration).toContain('grant select, insert, update on public.crm_tasks to authenticated');
    expect(migration).not.toContain('grant select, insert, update on public.crm_tasks to service_role');
    expect(migration).not.toContain('security definer');
  });

  it('audits lifecycle metadata without copying task title or description', () => {
    expect(migration).toContain("'CRM_TASK_CREATED'");
    expect(migration).toContain("'CRM_TASK_STATUS_CHANGED'");
    expect(migration).toContain("'CRM_TASK_UPDATED'");
    expect(migration).not.toContain("'title', new.title");
    expect(migration).not.toContain("'description', new.description");
  });

  it('uses optimistic versioning and a deterministic cursor query', () => {
    expect(migration).toContain('new.version := old.version + 1');
    expect(migration).toContain('create or replace function public.get_crm_tasks');
    expect(migration).toContain('security invoker');
    expect(migration).toContain('t.updated_at = p_before_updated_at');
    expect(migration).toContain('t.id < p_before_id');
    expect(runtime).toContain(".eq('version', input.expectedVersion)");
  });

  it('keeps the API on signed-in Supabase/RLS and out of provider send paths', () => {
    expect(route).toContain("import { createClient } from '@/lib/supabase/server'");
    expect(route).toContain('supabase.auth.getUser()');
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(route).not.toContain('SUPABASE_SECRET_KEY');

    const combined = migration + route + runtime;
    expect(combined).not.toContain('MetaCloudWhatsAppProvider');
    expect(combined).not.toContain('ResendEmailProvider');
    expect(combined).not.toMatch(/send(?:Email|Text|Template)\s*\(/);
  });
});
