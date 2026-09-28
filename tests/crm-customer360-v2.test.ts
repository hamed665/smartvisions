import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CRM_CUSTOMER360_ENTITY_TYPES,
  CRM_CUSTOMER360_RESOLUTION_ROLES,
  isCrmCustomer360EntityType,
  isCrmCustomer360ResolutionRole,
} from '@/lib/crm/customer360';

describe('CRM-CUSTOMER360-V2 Person context', () => {
  const migration = readFileSync('supabase/migrations/0129_crm_customer360_v2_person_context.sql', 'utf8');
  const route = readFileSync('app/api/crm/customer360/route.ts', 'utf8');
  const detail = readFileSync('app/customers/[id]/page.tsx', 'utf8');
  const actions = readFileSync('app/customers/[id]/customer360-actions.tsx', 'utf8');
  const shell = readFileSync('app/app-shell.tsx', 'utf8');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

  it('extends canonical operational authorities instead of creating a second Customer store', () => {
    for (const table of ['public.leads', 'public.sales_conversations', 'public.crm_tasks', 'public.crm_deals']) {
      expect(migration).toContain(`alter table ${table}`);
    }
    expect(migration).not.toMatch(/create table if not exists public\.crm_customers\b/i);
    expect(migration).not.toMatch(/create table if not exists public\.customer_360\b/i);
  });

  it('keeps Person attribution explicit, evidenced and directly foreign-keyed', () => {
    expect(migration).toContain('person_id uuid');
    expect(migration).toContain('references public.crm_people(organization_id, id)');
    expect(migration).toContain('person_link_method');
    expect(migration).toContain('person_link_source_ref');
    expect(migration).toContain('person_link_evidence');
    expect(migration).toContain('octet_length(person_link_evidence::text) <= 8192');
  });

  it('uses narrow resolution roles and supported entity types', () => {
    expect(CRM_CUSTOMER360_RESOLUTION_ROLES).toEqual(['OWNER', 'ADMIN', 'SALES_MANAGER']);
    expect(CRM_CUSTOMER360_ENTITY_TYPES).toEqual(['LEAD', 'CONVERSATION', 'TASK', 'DEAL']);
    expect(isCrmCustomer360ResolutionRole('SALES_AGENT')).toBe(false);
    expect(isCrmCustomer360EntityType('CONVERSATION')).toBe(true);
    expect(isCrmCustomer360EntityType('PAYMENT')).toBe(false);
  });

  it('keeps browser mutation manual-only behind the service client', () => {
    expect(route).toContain("verificationMethod: 'MANUAL_CONFIRMED'");
    expect(route).not.toContain("verificationMethod: 'PROVIDER_AUTHENTICATED'");
    expect(route).not.toContain("verificationMethod: 'IMPORT_VERIFIED'");
    expect(route).toContain('createSupabaseServiceClient()');
  });

  it('fails closed on Company-only context and cross-Person conflicts', () => {
    expect(migration).toContain('requires an active Person-Company relationship for entity Business context');
    expect(migration).toContain('entity already belongs to another Person');
    expect(migration).toContain('entity was not found in the Organization');
  });

  it('allows only service-role Person-context-only updates through the existing Deal guard', () => {
    expect(migration).toContain("current_user = 'service_role'");
    expect(migration).toContain("to_jsonb(new) - array[");
    expect(migration).toContain("'person_id','person_link_method','person_link_source_ref'");
    expect(migration).toContain('new.version := old.version + 1');
  });

  it('preserves direct Customer 360 links across governed Person merge', () => {
    expect(migration).toContain('reconcile_crm_customer360_person_merge');
    expect(migration).toContain('set person_id = new.merged_into_person_id');
    expect(migration).not.toContain("'merged_from_person_id'");
    for (const table of ['public.leads', 'public.sales_conversations', 'public.crm_tasks', 'public.crm_deals']) {
      expect(migration).toContain(`update ${table}`);
    }
  });

  it('never attributes Company timeline activity unless Lead or Conversation is directly linked', () => {
    expect(migration).toContain('and l.person_id = p_person_id');
    expect(migration).toContain('and c.person_id = p_person_id');
    expect(migration).toContain('A Company relationship alone never attributes activity');
  });

  it('bounds every Customer 360 collection by the requested limit', () => {
    expect((migration.match(/limit p_limit/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });

  it('keeps unavailable canonical modules explicit instead of fabricating them', () => {
    for (const module of ['bookings', 'quotes', 'orders', 'invoices', 'payments', 'supportCases', 'documents', 'consent']) {
      expect(migration).toContain(`'${module}', 'MODULE_NOT_IMPLEMENTED'`);
    }
  });

  it('exposes Customer list/detail and governed correction UX', () => {
    expect(shell).toContain("['Customers', '/customers']");
    expect(detail).toContain('Only explicit evidence-backed links are attributed to this Person');
    expect(actions).toContain("action: 'LINK'");
    expect(actions).toContain("action: 'UNLINK'");
    expect(actions).toContain("fetch('/api/crm/customer360'");
  });

  it('runs a dedicated PostgreSQL 17 Customer 360 smoke', () => {
    expect(ci).toContain('crm-customer360-v2-person-context-smoke.sql');
  });
});
