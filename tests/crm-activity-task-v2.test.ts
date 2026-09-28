import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/0131_crm_activity_task_v2.sql', 'utf8');
const runtime = readFileSync('lib/crm/tasks.ts', 'utf8');
const route = readFileSync('app/api/crm/tasks/route.ts', 'utf8');
const page = readFileSync('app/tasks/page.tsx', 'utf8');
const actions = readFileSync('app/tasks/task-actions.tsx', 'utf8');
const shell = readFileSync('app/app-shell.tsx', 'utf8');
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

describe('CRM-ACTIVITY-TASK-V2', () => {
  it('extends the canonical Task store and does not create a second activity/task truth', () => {
    expect(migration).toContain('alter table public.crm_tasks');
    expect(migration).not.toMatch(/create table (?:if not exists )?public\.crm_activities\b/i);
    expect(migration).not.toMatch(/create table (?:if not exists )?public\.crm_tasks_v2\b/i);
    expect(migration).toContain('create or replace view public.crm_task_activity_v2');
    expect(migration).toContain("from public.audit_logs a");
  });

  it('adds Deal scope with tenant and Business/Lead lineage guards', () => {
    expect(migration).toContain('add column if not exists deal_id uuid');
    expect(migration).toContain('references public.crm_deals(organization_id, id)');
    expect(migration).toContain('CRM task Deal must match task Business');
    expect(migration).toContain('CRM task Deal/Lead lineage mismatch');
    expect(runtime).toContain('dealId?: string | null');
    expect(route).toContain("url.searchParams.get('dealId')");
  });

  it('adds derived due/overdue and governed reminder semantics without a new queue', () => {
    expect(migration).toContain('add column if not exists reminder_at timestamptz');
    expect(migration).toContain('reminder_acknowledged_at timestamptz');
    expect(migration).toContain('as is_overdue');
    expect(migration).toContain('as reminder_due');
    expect(migration).toContain('acknowledge_crm_task_reminder');
    expect(migration).not.toMatch(/create table .*reminder/i);
  });

  it('keeps Activity evidence immutable and security-invoker', () => {
    expect(migration).toContain('create or replace view public.crm_task_activity_v2');
    expect(migration).toContain('with (security_invoker = true)');
    expect(migration).toContain('get_crm_task_activity_v2');
    expect(migration).not.toMatch(/security definer/i);
  });

  it('does not fabricate links to modules whose canonical authorities do not exist', () => {
    expect(migration).not.toContain('booking_id uuid');
    expect(migration).not.toContain('order_id uuid');
    expect(migration).not.toContain('case_id uuid');
    expect(migration).toContain('Booking/Order/Support Case links are not fabricated');
  });

  it('does not fake recurrence before a real recurring-work requirement exists', () => {
    expect(migration).toContain('Recurrence is intentionally not materialized here');
    expect(migration).not.toContain('recurrence_rule');
    expect(migration).not.toContain('repeat_frequency');
  });

  it('keeps audit useful without copying Task title/description', () => {
    expect(migration).toContain("'CRM_TASK_REMINDER_CHANGED'");
    expect(migration).toContain("'deal_id', new.deal_id");
    expect(migration).toContain("'person_id', new.person_id");
    expect(migration).not.toContain("'title', new.title");
    expect(migration).not.toContain("'description', new.description");
  });

  it('wires Task v2 filters and operator actions into the existing API/UI', () => {
    expect(runtime).toContain("rpc('get_crm_tasks_v2'");
    expect(runtime).toContain('acknowledgeCrmTaskReminder');
    expect(route).toContain("body.action === 'ACK_REMINDER'");
    expect(page).toContain('Actionable human work stays in one canonical Task store');
    expect(actions).toContain('REMINDER DUE');
    expect(actions).toContain("patch: { status: 'DONE' }");
    expect(shell).toContain("['Tasks', '/tasks']");
  });

  it('runs a dedicated PostgreSQL 17 Task v2 smoke', () => {
    expect(ci).toContain('crm-activity-task-v2-smoke.sql');
  });
});
