import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/0144_marketing_consent_governance.sql','utf8');
const gate = readFileSync('lib/outreach/canonical-send-gate.ts','utf8');
const route = readFileSync('app/api/outreach/approved-send/route-core.ts','utf8');
const action = readFileSync('app/marketing-consent-actions.ts','utf8');
const page = readFileSync('app/preferences/page.tsx','utf8');
const shell = readFileSync('app/app-shell.tsx','utf8');
const ci = readFileSync('.github/workflows/ci.yml','utf8');

describe('MARKETING-CONSENT governance contract', () => {
  it('extends canonical lead_sources and keeps suppression separate', () => {
    expect(migration).toContain('alter table public.lead_sources');
    expect(migration).toContain("field_name='marketing_permission'");
    expect(migration).not.toMatch(/create table\s+public\.(marketing_)?consent/i);
    expect(migration).not.toMatch(/alter table public\.suppression_list/i);
  });

  it('keeps permission evidence append-only behind the trusted boundary', () => {
    expect(migration).toContain('MARKETING permission evidence is append-only');
    expect(migration).toContain("current_user<>'service_role'");
    expect(migration).toContain('grant execute on function public.record_marketing_permission_event');
    expect(migration).toContain('to service_role;');
  });

  it('enforces marketing permission at the final canonical send gate', () => {
    expect(gate).toContain("blocks.push('MARKETING_PERMISSION_REQUIRED')");
    expect(gate).toContain('marketingPermissionRequired');
    expect(gate).toContain('getMarketingPermission');
    expect(route).toContain("campaign_kind");
    expect(route).toContain("canonicalSendPurpose = 'MARKETING'");
    expect(route).toContain('purpose: canonicalSendPurpose || null');
  });

  it('does not confuse Campaign or Segment state with consent', () => {
    expect(route).not.toMatch(/campaign_kind.*permissionAllowed/);
    expect(migration).toContain('permission_purpose');
    expect(migration).toContain('legal_basis');
    expect(migration).toContain('source_url');
    expect(migration).toContain('retrieved_at');
  });

  it('provides a governed preference surface without provider sends', () => {
    expect(action).toContain("record_marketing_permission_event");
    expect(page).toContain('Marketing Preferences');
    expect(page).toContain('Suppression / DNC remains a separate');
    expect(shell).toContain("['Marketing Preferences', '/preferences']");
    expect(action).not.toMatch(/approved-send|sendText|sendTemplate|ResendEmailProvider/);
  });

  it('runs PostgreSQL 17 consent acceptance in CI', () => {
    expect(ci).toContain('marketing-consent-governance-smoke.sql');
  });
});
