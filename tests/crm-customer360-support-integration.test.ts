import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CRM-CUSTOMER360-V2 Support integration', () => {
  const migration = readFileSync('supabase/migrations/0135_crm_customer360_support_integration.sql', 'utf8');
  const detail = readFileSync('app/customers/[id]/page.tsx', 'utf8');
  const library = readFileSync('lib/crm/customer360.ts', 'utf8');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

  it('extends the existing Customer 360 read model without creating another Support authority', () => {
    expect(migration).toContain('create or replace function public.get_crm_customer360_v2');
    expect(migration).toContain('from public.crm_support_cases');
    expect(migration).not.toMatch(/create table if not exists public\.crm_support/i);
    expect(migration).not.toMatch(/create table public\.crm_support/i);
  });

  it('attributes only explicit Person-linked Support Cases', () => {
    expect(migration).toContain('and person_id = p_person_id');
    expect(migration).not.toContain('crm_person_business_relationships r\n');
    expect(migration).toContain("'supportCases', 'IMPLEMENTED'");
  });

  it('does not widen immutable Support context through generic Customer 360 link correction', () => {
    expect(library).toContain("['LEAD', 'CONVERSATION', 'TASK', 'DEAL']");
    expect(library).not.toContain("'SUPPORT_CASE'");
    expect(migration).toContain('Case Business/Person/Conversation context remains immutable after creation');
  });

  it('keeps sensitive Support prose out of the Customer 360 collection', () => {
    const supportStart = migration.indexOf("'supportCases', coalesce((");
    const timelineStart = migration.indexOf("'activityTimeline', coalesce((");
    const supportBlock = migration.slice(supportStart, timelineStart);
    expect(supportBlock).toContain("'subject'");
    expect(supportBlock).not.toContain("'description'");
    expect(supportBlock).not.toContain("'resolutionSummary'");
    expect(supportBlock).not.toContain("'csatComment'");
  });

  it('keeps Notes scoped instead of broadening private note visibility', () => {
    expect(migration).toContain("'notes', 'CANONICAL_LINK_PENDING'");
    expect(migration).toContain('private scoped Notes are not widened');
  });

  it('renders Support Cases in the existing Customer detail surface', () => {
    expect(detail).toContain('<h2>Support Cases</h2>');
    expect(detail).toContain('customer.supportCases ?? []');
    expect(detail).toContain('does not rewrite immutable Support Case identity/context');
  });

  it('keeps the existing authenticated SECURITY INVOKER read contract', () => {
    expect(migration).toContain('security invoker');
    expect(migration).toContain('grant execute on function public.get_crm_customer360_v2(uuid, uuid, integer)');
    expect(migration).toContain('to authenticated;');
  });

  it('runs dedicated PostgreSQL 17 Support integration smoke', () => {
    expect(ci).toContain('crm-customer360-support-integration-smoke.sql');
  });
});
