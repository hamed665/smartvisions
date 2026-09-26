import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  'supabase/migrations/0093_comm_unified_inbox_scope_boundary.sql',
  'utf8',
);
const smoke = fs.readFileSync(
  'tests/sql/comm-unified-inbox-scope-boundary-smoke.sql',
  'utf8',
);

describe('COMM-UNIFIED-INBOX scoped security boundary', () => {
  it('projects communication identifiers onto the existing Smart Core conversation', () => {
    expect(migration).toContain('unified_inbox_conversation_projections');
    expect(migration).toContain('conversation_id uuid not null references public.sales_conversations');
    expect(migration).toContain('tenant_business_id uuid not null');
    expect(migration).toContain('branch_id uuid not null');
    expect(migration).toContain('chatwoot_inbox_mapping_id uuid not null');
    expect(migration).toContain('chatwoot_conversation_display_id integer not null');
  });

  it('does not create a second CRM, tenant model or provider send path', () => {
    expect(migration).not.toMatch(/create table(?: if not exists)? public\\.(customers|contacts|tenant_businesses|sales_conversations)\\b/i);
    expect(migration).not.toMatch(/access_token|api_key|smtp_password|provider_secret/i);
    expect(migration).not.toMatch(/graph\.facebook|resend\.com|send_whatsapp|send_email/i);
  });

  it('preserves canonical scope precedence and fails non-empty ABAC attributes closed', () => {
    expect(migration).toContain("a.attributes = '{}'::jsonb");
    expect(migration).toContain("when 'TEAM' then 5");
    expect(migration).toContain("when 'DEPARTMENT' then 4");
    expect(migration).toContain("when 'BRANCH' then 3");
    expect(migration).toContain("when 'BUSINESS' then 2");
    expect(migration).toContain("when 'BRAND' then 1");
    expect(migration).toContain("if v_org_role = 'OWNER'");
  });

  it('replaces legacy Organization-wide conversation/contact RLS with scoped reads', () => {
    for (const policy of [
      'org_member_sales_conversations',
      'org_member_conversation_messages',
      'org_member_operator_briefs',
      'org_member_agent_runs',
      'org_member_leads',
      'org_member_businesses',
      'crm_identities_member_read',
      'crm_identity_links_member_read',
    ]) {
      expect(migration).toContain(`drop policy if exists ${policy}`);
    }
    expect(migration).toContain('can_read_unified_inbox_conversation');
    expect(migration).toContain('can_read_unified_inbox_lead');
    expect(migration).toContain('can_read_unified_inbox_business');
  });

  it('keeps projection writes dormant until the governed reconciler package exists', () => {
    expect(migration).toContain("coalesce(current_setting('smartvisions.unified_inbox_projection_command', true), '') <> '1'");
    expect(migration).toContain('Unified Inbox projection mutation requires reconciler command path');
    expect(migration).toContain('revoke all on table public.unified_inbox_conversation_projections');
    expect(migration).toContain('grant select on table public.unified_inbox_conversation_projections');
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)[^;]*unified_inbox_conversation_projections/is);
  });

  it('uses only SECURITY INVOKER database functions', () => {
    expect(migration).not.toMatch(/security\s+definer/i);
    expect((migration.match(/security invoker/gi) ?? []).length)
      .toBe((migration.match(/create or replace function public\./gi) ?? []).length);
  });

  it('contains executable PostgreSQL 17 scope assertions in CI smoke coverage', () => {
    expect(smoke).toContain('scoped user leaked out-of-branch conversations');
    expect(smoke).toContain('TEAM VIEWER did not override broader BRANCH SALES_AGENT');
    expect(smoke).toContain('scoped user leaked unrelated Smart Core contact truth');
    expect(smoke).toContain('scoped user unexpectedly mutated a conversation');
  });
});
