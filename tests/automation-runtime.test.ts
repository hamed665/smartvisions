import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0153_automation_runtime.sql','utf8');
const runtime=readFileSync('lib/automation/runtime.ts','utf8');
const runtimeRoute=readFileSync('app/api/operations/automation-runtime/route.ts','utf8');
const eventRoute=readFileSync('app/api/operations/automation-runtime/event/route.ts','utf8');
const worker=readFileSync('worker/index.ts','utf8');
const tick=readFileSync('app/api/operations/tick/route.ts','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('AUTO-RUNTIME contract',()=>{
  it('adds durable child runtime state without a second workflow definition authority or scheduler',()=>{
    expect(migration).toContain('create table public.automation_runs');
    expect(migration).toContain('create table public.automation_run_actions');
    expect(migration).toContain('Durable ordered action outbox');
    expect(migration).toContain("where status='DEAD_LETTER'");
    expect(migration).not.toMatch(/create table public\.(automation_rules_v2|workflow_rules|workflow_definitions|runtime_queue|runtime_outbox)/i);
    expect(migration).not.toMatch(/cron\.schedule|pgmq\.|create extension.*pg_cron/i);
    expect(worker).toContain("'/api/operations/automation-runtime'");
  });

  it('uses immutable published READY rules and isolates the legacy executor',()=>{
    expect(migration).toContain('r.latest_published_version>0');
    expect(migration).toContain("r.execution_state='READY'");
    expect(migration).toContain('automation_rule_versions');
    expect(tick).toContain(".eq('latest_published_version', 0)");
  });

  it('provides leases retries DLQ timeouts compensation idempotency and verification',()=>{
    for(const marker of [
      'claim_automation_runtime_actions',
      'for update of a skip locked',
      'lease_expires_at',
      "'BOUNDED_IDEMPOTENT','NO_AUTOMATIC_RETRY','RECONCILIATION_ONLY'",
      "'DEAD_LETTER'",
      'reap_automation_runtime_timeouts',
      'automation_runtime_require_compensation',
      'automation_runs_event_idempotency_uidx',
      'Automation runtime success requires verified outcome evidence',
    ]) expect(migration).toContain(marker);
  });

  it('keeps runtime mutations service-only and SECURITY INVOKER',()=>{
    expect(migration).toContain("current_user<>'service_role'");
    expect(migration).toContain("coalesce(current_setting('app.automation_runtime_mutation',true),'')<>'allowed'");
    expect(migration).not.toMatch(/security definer/i);
    expect(migration).toContain('grant execute on function public.claim_automation_runtime_actions');
  });

  it('closes real action command gaps without inventing parallel authorities',()=>{
    expect(migration).toContain('create_automation_operator_brief');
    expect(migration).toContain('mark_crm_lead_hot_from_automation');
    expect(migration).toContain('create_automation_approval_message');
    expect(migration).toContain('pause_automation_rule_from_runtime');
    expect(migration).toContain('crm_lead_effective_opportunity_score');
    expect(migration).toContain("'AUTOMATION_RULE_PAUSED_BY_RUNTIME'");
  });

  it('validates action config before published execution',()=>{
    expect(migration).toContain('validate_automation_runtime_action_configs');
    expect(migration).toContain('MARK_HOT minimumScore must be an integer between 50 and 100');
    expect(migration).toContain('SEND_FOLLOWUP runtime config requires body and canonical sendContext');
    expect(migration).toContain("'INBOUND','OUTBOUND_PREVIEW','HOT_LEAD','HANDOFF','DAILY_REPORT'");
  });

  it('does not falsely unlock SEGMENT_MEMBER_ENTERED without a producer',()=>{
    expect(migration).toContain('SEGMENT_MEMBER_ENTERED remains dependency-pending');
    expect(migration).not.toContain("where trigger_key='SEGMENT_MEMBER_ENTERED'");
  });

  it('dispatches all six canonical actions through existing authorities',()=>{
    for(const key of [
      "'GENERATE_PREVIEW'",
      "'HANDOFF_HUMAN'",
      "'CREATE_OPERATOR_BRIEF'",
      "'MARK_HOT'",
      "'PAUSE_AUTOMATION'",
      "'SEND_FOLLOWUP'",
    ]) expect(runtime).toContain(key);
    expect(runtime).toContain('generateProductionAsset');
    expect(runtime).toContain('persistHumanHandoff');
    expect(runtime).toContain("rpc('create_automation_operator_brief'");
    expect(runtime).toContain("rpc('mark_crm_lead_hot_from_automation'");
    expect(runtime).toContain("rpc('pause_automation_rule_from_runtime'");
    expect(runtime).toContain("rpc('create_automation_approval_message'");
  });

  it('keeps provider dispatch behind the canonical approved-send route and Shadow release',()=>{
    expect(runtime).toContain("if (controls.shadow_mode)");
    expect(runtime).toContain("'WAITING_RELEASE'");
    expect(runtimeRoute).toContain("approvedSendPost");
    expect(runtimeRoute).toContain("body: JSON.stringify({ organizationId, messageId })");
    expect(runtimeRoute).not.toContain('controlledShadowPilot');
    expect(runtimeRoute).not.toContain('controlledEmailPilot');
    expect(runtimeRoute).not.toContain('controlledWhatsAppOptInPilot');
  });

  it('provides internal-only event ingress and scheduled drain wiring',()=>{
    expect(eventRoute).toContain('requireInternalApiKey');
    expect(eventRoute).toContain("rpc('enqueue_automation_runtime_event'");
    expect(runtimeRoute).toContain('requireInternalApiKey');
    expect(worker).toContain('automationRuntimeStatus');
    expect(worker).toContain('automationRuntimeClaimed');
  });

  it('runs controlled PostgreSQL runtime acceptance in CI',()=>{
    expect(ci).toContain('automation-runtime-smoke.sql');
  });
});
