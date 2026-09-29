import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page=readFileSync('app/automations/page.tsx','utf8');
const builder=readFileSync('components/automations/AutomationBuilder.tsx','utf8');
const testRoute=readFileSync('app/api/automations/test/route.ts','utf8');
const styles=readFileSync('app/styles.css','utf8');

describe('AUTO-BUILDER contract',()=>{
  it('builds over canonical automation authorities rather than creating a second workflow model',()=>{
    expect(page).toContain("from('automation_rules')");
    expect(page).toContain("from('automation_rule_versions')");
    expect(page).toContain("from('automation_runs')");
    expect(page).toContain("from('automation_run_actions')");
    expect(builder).toContain('saveAutomationRuleDraft');
    expect(builder).toContain('publishAutomationRule');
    expect(builder).toContain('setAutomationRuleEnabled');
    expect(builder).not.toMatch(/create table|automation_builder_rules|builder_workflows/i);
  });

  it('provides business-facing templates and visual trigger condition action editing',()=>{
    expect(builder).toContain('TEMPLATE_DEFINITIONS');
    expect(builder).toContain('automationTemplateRail');
    expect(builder).toContain('automationConditionRow');
    expect(builder).toContain('automationActionCard');
    expect(builder).toContain('Match');
    expect(builder).toContain('+ Condition');
    expect(builder).toContain('+ Action');
    expect(builder).not.toContain('Conditions JSON');
    expect(builder).not.toContain('Ordered actions JSON');
  });

  it('preserves advanced condition graphs instead of silently flattening them',()=>{
    expect(builder).toContain('Advanced condition graph preserved');
    expect(builder).toContain('It is preserved exactly');
    expect(builder).toContain('preserveAdvancedConditions');
  });

  it('uses canonical server validators for side-effect-free test mode',()=>{
    expect(testRoute).toContain("rpc(\n    'validate_automation_conditions'");
    expect(testRoute).toContain("'validate_automation_actions'");
    expect(testRoute).toContain("'validate_automation_runtime_action_scopes'");
    expect(testRoute).toContain("'validate_automation_runtime_action_configs'");
    expect(testRoute).toContain("'evaluate_automation_conditions'");
    expect(testRoute).toContain('sideEffects: false');
    expect(testRoute).not.toContain('enqueue_automation_runtime_event');
    expect(testRoute).not.toContain('approved-send');
    expect(testRoute).not.toContain('runAutomationRuntimeTick');
  });

  it('keeps provider-bound SEND_FOLLOWUP behind governed runtime configuration',()=>{
    expect(builder).toContain("action.key === 'SEND_FOLLOWUP'");
    expect(builder).toContain('Message body');
    expect(builder).toContain('Market code');
    expect(builder).toContain('approval {contract?.approval_requirement');
    expect(builder).not.toContain('fetch(\'/api/outreach/approved-send');
  });

  it('surfaces immutable version comparison execution history and runtime diagnostics',()=>{
    expect(builder).toContain('Version comparison');
    expect(builder).toContain('Execution history');
    expect(builder).toContain('Error diagnostics');
    expect(builder).toContain('compensation_status');
    expect(page).toContain('.limit(200)');
    expect(page).toContain('.limit(100)');
  });

  it('keeps draft publish enable as separate explicit actions',()=>{
    expect(builder).toContain('Create disabled draft');
    expect(builder).toContain('Save draft revision');
    expect(builder).toContain('Publish tested draft');
    expect(builder).toContain('Enable published workflow');
    expect(builder).toContain('Saving never publishes or enables automatically.');
  });

  it('has responsive builder-specific presentation',()=>{
    for(const marker of [
      '.automationBuilder',
      '.automationFlow',
      '.automationTemplateRail',
      '.automationTestPanel',
      '.automationHistoryGrid',
      '@media(max-width:820px)',
    ]) expect(styles).toContain(marker);
  });
});
