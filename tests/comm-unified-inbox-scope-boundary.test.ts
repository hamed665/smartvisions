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
    expect(migration).toContain('cb.channel = v_conversation_channel');
  });

  it('does not create a second CRM, tenant model or provider send path', () => {
    expect(migration).not.toMatch(/create table(?: if not exists)? public\\.(customers|contacts|tenant_businesses|sales_conversations)\\b/i);
    expect(migration).not.toMatch(/access_token|api_key|smtp_password|provider_secret/i);
    expect(migration).not.toMatch(/graph\.facebook|resend\.com|send_whatsapp|send_email/i);
  });

  it('preserves scope precedence, scoped-only fail-closed behavior and VIEWER read semantics', () => {
    expect(migration).toContain('is_unified_inbox_scoped_only_member');
    expect(migration).toContain("coalesce(v_scope_attributes, '{}'::jsonb) <> '{}'::jsonb");
    expect(migration).toContain("when 'TEAM' then 5");
    expect(migration).toContain("when 'DEPARTMENT' then 4");
    expect(migration).toContain("when 'BRANCH' then 3");
    expect(migration).toContain("when 'BUSINESS' then 2");
    expect(migration).toContain("when 'BRAND' then 1");
    expect(migration).toContain("if v_org_role = 'OWNER'");
    expect(migration).toContain("v_org_role = 'VIEWER'");
    expect(migration).toContain("in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER')");
    expect(migration).toContain('is_unified_inbox_business_wide_member');
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

  it('blocks scoped-only escape through legacy Organization-wide surfaces', () => {
    expect(migration).toContain('unified_inbox_business_wide_boundary');
    expect(migration).toContain("'whatsapp_events'");
    expect(migration).toContain("'system_controls'");
    expect(migration).toContain('unified_inbox_audit_business_wide_read_boundary');
    expect(smoke).toContain('scoped user leaked raw Organization-wide communication event history');
    expect(smoke).toContain('Business-wide VIEWER unexpectedly hit scoped-only legacy boundary');
  });

  it('keeps tenant/channel identity immutable but leaves assignment snapshots reconcilable', () => {
    const guard = migration.slice(
      migration.indexOf("if tg_op = 'UPDATE' then"),
      migration.indexOf("if new.version <> old.version + 1"),
    );
    expect(guard).toContain('new.branch_id is distinct from old.branch_id');
    expect(guard).toContain('new.chatwoot_inbox_mapping_id is distinct from old.chatwoot_inbox_mapping_id');
    expect(guard).not.toContain('new.department_id is distinct from old.department_id');
    expect(guard).not.toContain('new.team_id is distinct from old.team_id');
    expect(guard).not.toContain('new.chatwoot_team_mapping_id is distinct from old.chatwoot_team_mapping_id');
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

  it('contains no malformed single-dollar PL/pgSQL or SQL function delimiter', () => {
    expect(migration).not.toMatch(/\nas \$\n/);
    expect(migration).not.toMatch(/\n\$;\n/);
  });

  it('contains executable PostgreSQL 17 scope assertions in CI smoke coverage', () => {
    expect(smoke).toContain('scoped user leaked out-of-branch conversations');
    expect(smoke).toContain('TEAM VIEWER did not override broader BRANCH SALES_AGENT');
    expect(smoke).toContain('scoped user leaked unrelated Smart Core contact truth');
    expect(smoke).toContain('scoped user unexpectedly mutated a conversation');
    expect(smoke).toContain('scoped-only VIEWER fell back outside assigned Branch scope');
    expect(smoke).toContain('Business-wide VIEWER lost intended read visibility');
    expect(smoke).toContain('Business-wide ADMIN lost existing Organization-wide conversation visibility');
    expect(smoke).toContain('scoped user leaked raw Organization-wide communication event history');
  });
});
