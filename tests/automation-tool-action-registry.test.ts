import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0151_automation_tool_action_registry.sql','utf8');
const page=readFileSync('app/automations/page.tsx','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');
const workflowSmoke=readFileSync('tests/sql/automation-workflow-model-smoke.sql','utf8');
const triggerSmoke=readFileSync('tests/sql/automation-trigger-catalog-smoke.sql','utf8');

describe('AUTO-TOOL-ACTION-REGISTRY contract',()=>{
  it('creates one canonical metadata registry without creating a second executor/gateway/queue',()=>{
    expect(migration).toContain('create table public.tool_action_registry');
    expect(migration).toContain('not an executor, queue, outbox, provider-send authority or approval engine');
    expect(migration).not.toMatch(/create table public\.(action_requests|action_gateway|tool_runs|automation_execut|queue|outbox)/i);
  });

  it('carries every required action contract field',()=>{
    for(const field of [
      'input_schema','output_schema','permission_key','scope_type',
      'idempotency_required','idempotency_key_contract','cost_class',
      'side_effect_class','approval_requirement','verifier_key','audit_contract',
    ]) expect(migration).toContain(field);
  });

  it('catalogs all six existing workflow action keys and is honest about readiness',()=>{
    for(const key of [
      'GENERATE_PREVIEW','SEND_FOLLOWUP','CREATE_OPERATOR_BRIEF',
      'HANDOFF_HUMAN','PAUSE_AUTOMATION','MARK_HOT',
    ]) expect(migration).toContain(`'${key}','`);

    expect(migration).toContain("'AVAILABLE'");
    expect(migration).toContain("'DEPENDENCY_PENDING'");
    expect(migration).toContain("array['AUTO-APPROVAL','AUTO-RUNTIME']");
    expect(migration).toContain('"forbidden":["direct leads.status write"]');
  });

  it('wires outbound approval to the existing approval_rules authority',()=>{
    expect(migration).toContain("'SEND_FOLLOWUP','OUTREACH_SEND','APPROVED_SEND_POLICY'");
    expect(migration).toContain("'REQUIRED','OUTBOUND_SEND'");
    expect(migration).toContain('from public.approval_rules a');
    expect(migration).not.toMatch(/create table public\.approval/i);
  });

  it('fails closed for unknown or dependency-pending actions and rechecks enablement',()=>{
    expect(migration).toContain('Automation action is not cataloged');
    expect(migration).toContain('Automation action is not publishable');
    expect(migration).toContain('automation_rule_versions_action_registry_guard');
    expect(migration).toContain('automation_rules_enable_action_registry_guard');
  });

  it('uses the database registry in the workflow UI instead of a hardcoded action list',()=>{
    expect(page).toContain("from('tool_action_registry')");
    expect(page).toContain('Tool / action registry');
    expect(page).toContain('action.availability');
    expect(page).not.toContain('const ACTIONS=[');
  });

  it('keeps prior publish smokes on an AVAILABLE action contract',()=>{
    expect(workflowSmoke).toContain('GENERATE_PREVIEW');
    expect(triggerSmoke).toContain('GENERATE_PREVIEW');
  });

  it('runs controlled PostgreSQL acceptance in CI',()=>{
    expect(ci).toContain('automation-tool-action-registry-smoke.sql');
  });
});
