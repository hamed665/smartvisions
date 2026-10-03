import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only',()=>({}));

import {
  createOwnerCopilotPreviewToken,
  verifyOwnerCopilotPreviewToken,
} from '@/lib/owner-copilot/preview-token';

const routeSource=readFileSync('app/api/owner-copilot/route.ts','utf8');
const panelSource=readFileSync('lib/telegram/panel-parity.ts','utf8');
const plannerSource=readFileSync('lib/telegram/assistant-planner.ts','utf8');
const snapshotSource=readFileSync('lib/owner-copilot/operational-snapshot.ts','utf8');
const migration=readFileSync('supabase/migrations/20261003225641_ai_owner_copilot.sql','utf8');
const pageSource=readFileSync('app/copilot/page.tsx','utf8');
const founderAskSource=readFileSync('app/founder/founder-ask.tsx','utf8');

describe('AI-OWNER-COPILOT',()=>{
  it('keeps one canonical Tool Registry and creates no second execution store',()=>{
    expect(migration).toContain('public.tool_action_registry');
    expect(migration).not.toMatch(/create\s+table/i);
    expect(migration).toContain("'OWNER_COPILOT'");
    expect(migration).toContain("'providerSend',false");
    expect(migration).toContain("'paymentExecution',false");
    expect(migration).toContain("'OWNER_COPILOT_CONFIRM'");
  });

  it('requires a signed identity-bound Preview confirmation before mutation',()=>{
    const previous=process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY='owner-copilot-test-signing-key';
    try{
      const command={
        type:'PANEL_ACTION' as const,
        action:'lead.update' as const,
        args:{id:'11111111-1111-4111-8111-111111111111',status:'HOT',agent_mode:'HUMAN'},
      };
      const token=createOwnerCopilotPreviewToken({
        organizationId:'22222222-2222-4222-8222-222222222222',
        userId:'33333333-3333-4333-8333-333333333333',
        role:'OWNER',
        confirmationId:'44444444-4444-4444-8444-444444444444',
        command,
        preview:{before:{status:'INTERESTED'},after:{status:'HOT'}},
      });
      const decoded=verifyOwnerCopilotPreviewToken(token,{
        organizationId:'22222222-2222-4222-8222-222222222222',
        userId:'33333333-3333-4333-8333-333333333333',
        role:'OWNER',
      });
      expect(decoded.confirmationId).toBe('44444444-4444-4444-8444-444444444444');
      expect(()=>verifyOwnerCopilotPreviewToken(token,{
        organizationId:'22222222-2222-4222-8222-222222222222',
        userId:'55555555-5555-4555-8555-555555555555',
        role:'OWNER',
      })).toThrow(/identity mismatch/i);
      expect(()=>verifyOwnerCopilotPreviewToken(token+'x',{
        organizationId:'22222222-2222-4222-8222-222222222222',
        userId:'33333333-3333-4333-8333-333333333333',
        role:'OWNER',
      })).toThrow();
    }finally{
      if(previous===undefined) delete process.env.INTERNAL_API_KEY;
      else process.env.INTERNAL_API_KEY=previous;
    }
  });

  it('rechecks policy, registry, stale state, replay evidence, verifier and audit at the gateway',()=>{
    expect(panelSource).toContain('requireOwnerCopilotRegistryContract');
    expect(panelSource).toContain("'SIGNED_PREVIEW_CONFIRM'");
    expect(panelSource).toContain("'global_kill_switch,shadow_mode,agents_paused'");
    expect(panelSource).toContain('Shadow Mode blocks Owner Copilot mutation');
    expect(panelSource).toContain("eq('correlation_id',confirmationId)");
    expect(panelSource).toContain('Canonical state changed after preview');
    expect(panelSource).toContain('assertOwnerCopilotVerified');
    expect(panelSource).toContain("action: auditAction");
    expect(panelSource).toContain("correlation_id: surface==='OWNER_COPILOT'");
  });

  it('keeps provider sends and provider money movement outside direct Copilot actions',()=>{
    expect(panelSource).toContain('Owner Copilot cannot execute provider payment operations');
    expect(panelSource).toContain('provider_send_triggered: false');
    expect(panelSource).toContain('payment_execution_triggered: false');
    expect(migration).not.toContain("'EXTERNAL_PROVIDER','REQUIRED','OWNER_COPILOT_CONFIRM'");
    expect(migration).toContain('Create an internal Payment Intent only; no provider charge or payment execution occurs.');
    expect(migration).toContain('Create a governed refund request only; no provider refund execution occurs.');
  });

  it('allows the model to propose only currently registered Owner actions',()=>{
    expect(plannerSource).toContain('AVAILABLE_OWNER_ACTIONS');
    expect(plannerSource).toContain("plan.command.type!=='PANEL_ACTION'");
    expect(plannerSource).toContain('OWNER_COPILOT_REGISTRY_REQUIRED');
    expect(plannerSource).toContain('Never execute anything');
    expect(plannerSource).toContain('Never invent IDs, versions, request evidence, amounts, dates, statuses or entities');
  });

  it('uses bounded canonical operational evidence including team, follow-ups and reports',()=>{
    expect(snapshotSource).toContain('const LIMIT=8');
    expect(snapshotSource).toContain("from('crm_deals')");
    expect(snapshotSource).toContain("from('crm_tasks')");
    expect(snapshotSource).toContain("from('bookings')");
    expect(snapshotSource).toContain("from('quotes')");
    expect(snapshotSource).toContain("from('orders')");
    expect(snapshotSource).toContain("from('invoices')");
    expect(snapshotSource).toContain("from('payment_intents')");
    expect(snapshotSource).toContain("from('founder_board_reports')");
    expect(snapshotSource).toContain('followUps');
    expect(snapshotSource).toContain('team');
    expect(snapshotSource).toContain('not a historical analytics warehouse');
  });

  it('ships a real OWNER/ADMIN web surface while preserving Founder Copilot as read-only analysis',()=>{
    expect(pageSource).toContain("['OWNER','ADMIN']");
    expect(routeSource).toContain("mode==='ASK'");
    expect(routeSource).toContain("mode==='CONFIRM'");
    expect(routeSource).toContain("confirmationId:randomUUID()");
    expect(routeSource).toContain("approvalEvidence:{type:'SIGNED_PREVIEW_CONFIRM'");
    expect(founderAskSource).toContain('Evidence-first, read-only analysis');
    expect(founderAskSource).toContain("fetch('/api/founder/ask'");
    expect(founderAskSource).not.toContain('/api/owner-copilot');
  });
});
