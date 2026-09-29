import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0150_automation_condition_engine.sql','utf8');
const page=readFileSync('app/automations/page.tsx','utf8');
const builder=readFileSync('components/automations/AutomationBuilder.tsx','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');
const workflowSmoke=readFileSync('tests/sql/automation-workflow-model-smoke.sql','utf8');

describe('AUTO-CONDITION-ENGINE contract',()=>{
  it('extends canonical automation_rules.conditions without creating a second rules engine or fact store',()=>{
    expect(migration).toContain('automation_rules.conditions');
    expect(migration).toContain('automation_condition_fact_catalog');
    expect(migration).toContain('stores no customer or workflow-runtime fact values');
    expect(migration).not.toMatch(/create table public\.(rules_engine|workflow_conditions|automation_facts|customer_facts|fact_store)/i);
  });

  it('uses typed allowlisted operators with bounded recursive complexity',()=>{
    for(const marker of [
      "'TEXT'","'NUMBER'","'BOOLEAN'","'UUID'","'TIMESTAMP'",
      "'AND'","'OR'","depth exceeds 4","exceed 20 leaves","1..8 nodes","1..20",
    ]) expect(migration).toContain(marker);
    expect(migration).toContain('Automation condition fact is not cataloged');
    expect(migration).toContain('Automation condition operator');
  });

  it('binds evaluation to canonical Organization-scoped subjects and explicit columns',()=>{
    for(const table of [
      'public.leads','public.crm_deals','public.crm_tasks','public.businesses',
      'public.sales_conversations','public.crm_segment_snapshots','public.crm_support_cases',
    ]) expect(migration).toContain(table);
    expect(migration).toContain('where l.organization_id=p_organization_id and l.id=p_subject_id');
    expect(migration).toContain('Automation condition subject was not found in Organization');
    expect(migration).toContain('evaluate_automation_conditions');
  });

  it('does not expose arbitrary SQL or browser-side trusted evaluation',()=>{
    expect(migration.toLowerCase()).not.toContain('execute format');
    expect(migration.toLowerCase()).not.toContain('execute immediate');
    expect(migration).toContain('from public,anon,authenticated');
    expect(migration).toContain('to service_role');
    expect(migration).toContain('No arbitrary SQL/eval');
  });

  it('keeps trigger subject and condition subject compatible',()=>{
    expect(migration).toContain("when 'MESSAGE' then 'CONVERSATION'");
    expect(migration).toContain("when 'CUSTOMER' then 'ACCOUNT'");
    expect(migration).toContain("when 'LEAD' then 'LEAD'");
    expect(migration).toContain('does not match trigger subject');
  });

  it('updates existing workflow-model acceptance to the typed condition contract',()=>{
    expect(workflowSmoke).toContain('"fact":"LEAD.STATUS"');
    expect(workflowSmoke).toContain('"fact":"LEAD.RECOMMENDED_OFFER"');
    expect(workflowSmoke).not.toContain('"field":"status"');
  });

  it('surfaces typed condition metadata through the governed visual builder',()=>{
    expect(page).toContain("from('automation_condition_fact_catalog')");
    expect(builder).toContain('automationConditionRow');
    expect(builder).toContain('fact?.data_type');
    expect(builder).toContain('fact?.operators');
    expect(builder).toContain('Advanced condition graph preserved');
  });

  it('runs PostgreSQL controlled acceptance in CI',()=>{
    expect(ci).toContain('automation-condition-engine-smoke.sql');
  });
});
