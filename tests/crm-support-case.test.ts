import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CRM_SUPPORT_MUTATION_ROLES,
  CRM_SUPPORT_PRIORITIES,
  CRM_SUPPORT_STATUSES,
  canMutateCrmSupport,
  isCrmSupportPriority,
  isCrmSupportStatus,
} from '@/lib/crm/support-cases';

describe('CRM-SUPPORT-CASE', () => {
  const migration = readFileSync('supabase/migrations/0132_crm_support_case.sql', 'utf8');
  const api = readFileSync('app/api/crm/support-cases/route.ts', 'utf8');
  const page = readFileSync('app/support-cases/page.tsx', 'utf8');
  const actions = readFileSync('app/support-cases/support-case-actions.tsx', 'utf8');
  const shell = readFileSync('app/app-shell.tsx', 'utf8');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

  it('creates one canonical Case authority plus Smart Core SLA policy', () => {
    expect(migration).toContain('create table if not exists public.crm_support_cases');
    expect(migration).toContain('create table if not exists public.crm_support_sla_policies');
    expect(migration).not.toMatch(/create table .*support_(tickets|events|activities)/i);
  });

  it('links only to currently canonical CRM authorities', () => {
    expect(migration).toContain('references public.businesses(id)');
    expect(migration).toContain('references public.crm_people(organization_id, id)');
    expect(migration).toContain('references public.sales_conversations(id)');
    expect(migration).not.toMatch(/\border_id\b/i);
    expect(migration).not.toMatch(/\bpayment_id\b/i);
  });

  it('covers required support lifecycle semantics', () => {
    expect(CRM_SUPPORT_PRIORITIES).toEqual(['LOW','NORMAL','HIGH','URGENT','CRITICAL']);
    expect(CRM_SUPPORT_STATUSES).toEqual(['OPEN','PENDING_CUSTOMER','PENDING_INTERNAL','RESOLVED','CLOSED']);
    expect(migration).toContain('first_response_due_at');
    expect(migration).toContain('resolution_due_at');
    expect(migration).toContain('escalation_level');
    expect(migration).toContain('resolution_summary');
    expect(migration).toContain('csat_score');
    expect(isCrmSupportPriority('URGENT')).toBe(true);
    expect(isCrmSupportStatus('RESOLVED')).toBe(true);
  });

  it('keeps mutation authority narrow and Viewer read-only', () => {
    expect(CRM_SUPPORT_MUTATION_ROLES).toEqual(['OWNER','ADMIN','SALES_MANAGER','SALES_AGENT']);
    expect(canMutateCrmSupport('VIEWER')).toBe(false);
    expect(migration).toContain("v_role='VIEWER'");
  });

  it('uses service-bound mutations and authenticated RLS reads', () => {
    expect(migration).toContain('alter table public.crm_support_cases enable row level security');
    expect(migration).toContain('to authenticated\n  using (public.is_org_member(organization_id))');
    expect(migration).not.toMatch(/security definer/i);
    for (const fn of [
      'create_crm_support_case_manual',
      'assign_crm_support_case_manual',
      'mark_crm_support_first_response_manual',
      'transition_crm_support_case_manual',
      'escalate_crm_support_case_manual',
      'record_crm_support_csat_manual',
    ]) {
      expect(migration).toContain(`grant execute on function public.${fn}`);
    }
  });

  it('keeps sensitive operator/customer prose out of audit payloads', () => {
    expect(migration).toContain("'reason_present',true");
    expect(migration).toContain("'has_description',p_description is not null");
    expect(migration).toContain("'has_comment',p_comment is not null");
  });

  it('ships a real operator surface instead of a decorative API only', () => {
    expect(shell).toContain("['Support Cases', '/support-cases']");
    expect(page).toContain('Smart Core owns Case state');
    expect(actions).toContain("action: 'CREATE_CASE'");
    expect(actions).toContain("action: 'FIRST_RESPONSE'");
    expect(actions).toContain("action: 'ESCALATE'");
    expect(actions).toContain("action: 'TRANSITION'");
    expect(actions).toContain("action: 'CSAT'");
    expect(api).toContain('createSupabaseServiceClient()');
  });

  it('runs dedicated PostgreSQL 17 acceptance and FK-index hardening', () => {
    expect(ci).toContain('crm-support-case-smoke.sql');
    expect(ci).toContain('crm-support-case-fk-index-hardening-smoke.sql');
  });
});
