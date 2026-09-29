import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0148_automation_workflow_model.sql','utf8');
const page=readFileSync('app/automations/page.tsx','utf8');
const actions=readFileSync('app/management-actions.ts','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('AUTO-WORKFLOW-MODEL contract',()=>{
  it('extends the canonical automation_rules authority instead of creating another engine',()=>{
    expect(migration).toContain('alter table public.automation_rules');
    expect(migration).toContain('create table public.automation_rule_versions');
    expect(migration).toContain('not a second workflow engine');
    expect(migration).not.toMatch(/create table public\.workflow(_|s|engine)/i);
    expect(migration).not.toMatch(/create table public\.automation_execut/i);
    expect(migration).not.toMatch(/create table public\.(queue|outbox)/i);
  });

  it('models trigger, conditions, actions, ownership and explicit execution eligibility',()=>{
    for(const marker of [
      'owner_user_id','trigger_key','conditions jsonb','actions jsonb',
      'publication_state','draft_revision','latest_published_version','execution_state',
    ]) expect(migration).toContain(marker);
    expect(migration).toContain("execution_state = 'READY'");
    expect(migration).toContain("execution_state = 'DISABLED'");
    expect(migration).toContain("execution_state = 'NOT_READY'");
  });

  it('publishes immutable snapshots and keeps unpublished draft edits separate',()=>{
    expect(migration).toContain('Published automation versions are immutable');
    expect(migration).toContain('AUTOMATION_RULE_PUBLISHED');
    expect(migration).toContain("publication_state='DRAFT'");
    expect(migration).toContain("publication_state='PUBLISHED'");
    expect(migration).toContain('draft_revision=v_rule.draft_revision+1');
  });

  it('keeps browser mutation out of the trusted workflow boundary',()=>{
    expect(migration).toContain('grant select on table public.automation_rules to authenticated,service_role');
    expect(migration).toContain('grant insert,update on table public.automation_rules to service_role');
    expect(migration).toContain('from public,anon,authenticated');
    expect(actions).toContain('createSupabaseServiceClient');
    expect(actions).toContain("rpc('create_automation_rule_draft'");
    expect(actions).toContain("rpc('publish_automation_rule'");
    expect(actions).toContain("rpc('set_automation_rule_enabled'");
  });

  it('exposes draft/publish/version/enable controls without pretending the runtime is complete',()=>{
    expect(page).toContain('Draft & published model');
    expect(page).toContain('Publish draft');
    expect(page).toContain('Published v');
    expect(page).toContain('Execution eligibility');
    expect(page).toContain('AUTO-RUNTIME is a separate Work Package');
  });

  it('runs the PostgreSQL acceptance smoke in CI',()=>{
    expect(ci).toContain('automation-workflow-model-smoke.sql');
  });
});
