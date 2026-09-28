import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SALES-NEXT-ACTION governance', () => {
  const migration = readFileSync('supabase/migrations/0140_sales_next_action.sql','utf8');
  const service = readFileSync('lib/crm/next-actions.ts','utf8');
  const route = readFileSync('app/api/crm/next-actions/route.ts','utf8');
  const internalRoute = readFileSync('app/api/internal/crm/next-actions/model-suggestion/route.ts','utf8');
  const page = readFileSync('app/next-actions/page.tsx','utf8');
  const controls = readFileSync('app/next-actions/next-action-controls.tsx','utf8');
  const shell = readFileSync('app/app-shell.tsx','utf8');
  const ci = readFileSync('.github/workflows/ci.yml','utf8');

  it('reuses canonical CRM Task, Lead, Deal and Conversation authorities', () => {
    expect(migration).toContain('public.crm_tasks');
    expect(migration).toContain('public.leads');
    expect(migration).toContain('public.crm_deals');
    expect(migration).toContain('public.sales_conversations');
    expect(migration).not.toMatch(/create table(?: if not exists)? public\.(?:sales_)?next_action/i);
    expect(migration).not.toMatch(/create table(?: if not exists)? public\.(?:sales_)?followup_queue/i);
    expect(migration).not.toContain('followup_jobs');
  });

  it('keeps stale detection derived and suppresses Lead candidates once an OPEN Deal exists', () => {
    expect(migration).toContain("'LEAD_STALE'");
    expect(migration).toContain("'DEAL_STALE'");
    expect(migration).toContain("'DEAL_CLOSE_OVERDUE'");
    expect(migration).toContain("d.state='OPEN'");
    expect(migration).toContain("l.status not in ('WON','LOST','DO_NOT_CONTACT')");
    expect(migration).toContain('make_interval(hours=>p_stale_hours)');
  });

  it('requires explicit human acceptance before a candidate becomes a Task', () => {
    expect(migration).toContain("source_type='NEXT_ACTION'");
    expect(migration).toContain("app.crm_next_action_accept");
    expect(migration).toContain('NEXT_ACTION CRM task must be accepted through governed candidate materialization');
    expect(migration).toContain('accept_crm_next_action_candidate');
    expect(route).toContain("body.action !== 'ACCEPT'");
    expect(controls).toContain('Accept as Task');
  });

  it('is replay-safe but rejects semantic request-key reuse', () => {
    const replayIndex = migration.indexOf("where t.organization_id=p_organization_id\n    and t.request_key=trim(p_request_key)");
    const staleIndex = migration.indexOf("if p_candidate_kind='LEAD_STALE' then");
    expect(replayIndex).toBeGreaterThan(0);
    expect(replayIndex).toBeLessThan(staleIndex);
    expect(migration).toContain('next action request key was reused with different semantics');
  });

  it('keeps AI suggestion advisory and behind a trusted service boundary', () => {
    expect(migration).toContain('next_action_model_suggestion');
    expect(migration).toContain("current_user<>'service_role'");
    expect(migration).toContain('record_crm_task_next_action_model_suggestion');
    expect(migration).toContain('to service_role');
    expect(internalRoute).toContain('requireInternalApiKey');
    expect(internalRoute).toContain('createSupabaseServiceClient');
    expect(page).toContain('Suggestions never send customer messages automatically');
  });

  it('does not let the model suggestion mutate task ownership, status, due time or send state', () => {
    const start = migration.indexOf('create or replace function public.record_crm_task_next_action_model_suggestion');
    const end = migration.indexOf('create or replace function public.audit_crm_next_action_mutation');
    const fn = migration.slice(start,end);
    expect(fn).toContain('next_action_model_suggestion=p_suggestion');
    expect(fn).not.toContain('assignee_user_id=');
    expect(fn).not.toContain('status=');
    expect(fn).not.toContain('due_at=');
    expect(fn).not.toContain('outreach_messages');
    expect(fn).not.toContain('conversation_messages');
  });

  it('exposes an operator queue and bounded API surface', () => {
    expect(service).toContain('listCrmNextActions');
    expect(service).toContain('acceptCrmNextActionCandidate');
    expect(route).toContain('staleHours');
    expect(route).toContain("Cache-Control': 'private, no-store");
    expect(page).toContain('Next Actions');
    expect(controls).toContain('Prioritized queue');
    expect(shell).toContain("['Next Actions', '/next-actions']");
  });

  it('runs PostgreSQL 17 acceptance in CI', () => {
    expect(ci).toContain('sales-next-action-smoke.sql');
  });
});
