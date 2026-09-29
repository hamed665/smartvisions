import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration=readFileSync('supabase/migrations/0152_automation_approval.sql','utf8');
const actions=readFileSync('app/management-actions.ts','utf8');
const page=readFileSync('app/approvals/page.tsx','utf8');
const ci=readFileSync('.github/workflows/ci.yml','utf8');

describe('AUTO-APPROVAL contract',()=>{
  it('extends existing approval/message/audit authorities without a second approval engine',()=>{
    expect(migration).toContain('alter table public.approval_rules');
    expect(migration).toContain('alter table public.conversation_messages');
    expect(migration).toContain('audit_logs_message_approval_request_uidx');
    expect(migration).not.toMatch(/create table public\.(approval_requests|approval_queue|approval_decisions|workflow_approvals)/i);
  });

  it('supports AUTO REVIEW STRICT policy modes plus deadlines and reviewer governance',()=>{
    for(const marker of [
      "'AUTO','REVIEW','STRICT'",
      'expiry_minutes','escalation_minutes','allow_delegation',
      'reviewer_roles','delegation_roles',
      'approval_expires_at','approval_escalates_at','approval_escalated_at',
    ]) expect(migration).toContain(marker);
  });

  it('implements replay-safe decision, delegation, expiry and escalation commands',()=>{
    for(const fn of [
      'decide_message_approval',
      'delegate_message_approval',
      'reconcile_due_message_approvals',
      'message_approval_replay',
    ]) expect(migration).toContain(fn);
    expect(migration).toContain('Message approval request key conflict');
    expect(migration).toContain('MESSAGE_APPROVAL_EXPIRED');
    expect(migration).toContain('MESSAGE_APPROVAL_ESCALATED');
  });

  it('requires a denial reason and protects pending approvals from direct updates',()=>{
    expect(migration).toContain("v_decision='REJECT'");
    expect(migration).toContain('length(v_reason) not between 3 and 500');
    expect(migration).toContain('Pending message approval must use governed approval commands');
    expect(migration).toContain('conversation_messages_approval_mutation_guard');
    expect(migration).toContain("coalesce(current_setting('app.message_approval_mutation',true),'')<>'allowed'");
  });

  it('removes AUTO-APPROVAL from SEND_FOLLOWUP dependency without pretending runtime exists',()=>{
    expect(migration).toContain("array['AUTO-RUNTIME']::text[]");
    expect(migration).toContain("where action_key='SEND_FOLLOWUP'");
    expect(migration).not.toContain("array['AUTO-APPROVAL','AUTO-RUNTIME']::text[]");
  });

  it('routes the server actions through governed approval RPCs',()=>{
    expect(actions).toContain("rpc('decide_message_approval'");
    expect(actions).toContain("rpc('delegate_message_approval'");
    expect(actions).not.toContain("action,'APPROVE_MESSAGE'");
    expect(actions).not.toContain("action,'REJECT_MESSAGE'");
  });

  it('surfaces policy mode deadlines escalation and delegation in the existing queue UI',()=>{
    for(const marker of [
      'approval_policy_mode','approval_expires_at','approval_escalated_at',
      'approval_reviewer_user_id','delegateMessageApproval',
    ]) expect(page).toContain(marker);
  });

  it('runs controlled PostgreSQL acceptance in CI',()=>{
    expect(ci).toContain('automation-approval-smoke.sql');
  });
});
