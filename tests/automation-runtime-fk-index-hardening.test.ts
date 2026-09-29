import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0154_automation_runtime_fk_index_hardening.sql','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('AUTO-RUNTIME FK index hardening',()=>{
  it('adds exactly the seven advisor-required covering indexes',()=>{
    for(const name of [
      'automation_run_actions_action_key_fk_idx',
      'automation_run_actions_run_fk_idx',
      'automation_runs_automation_rule_id_fk_idx',
      'automation_runs_automation_rule_version_id_fk_idx',
      'automation_runs_owner_fk_idx',
      'automation_runs_rule_version_fk_idx',
      'automation_runs_trigger_key_fk_idx',
    ]) expect(migration).toContain(`create index if not exists ${name}`);

    expect((migration.match(/create index if not exists/g) ?? []).length).toBe(7);
  });

  it('is index-only and does not mutate runtime data or authority',()=>{
    expect(migration).not.toMatch(/\b(insert|update|delete|truncate|create table|alter table|drop table)\b/i);
  });

  it('runs controlled PostgreSQL acceptance in CI',()=>{
    expect(ci).toContain('automation-runtime-fk-index-hardening-smoke.sql');
  });
});
