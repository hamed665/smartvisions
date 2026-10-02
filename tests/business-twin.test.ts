import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const migration=readFileSync('supabase/migrations/0180_business_twin.sql','utf8');
const page=readFileSync('app/business-twin/page.tsx','utf8');
const actions=readFileSync('app/business-twin/actions.ts','utf8');
const shell=readFileSync('app/app-shell.tsx','utf8');

describe('BRAIN-BUSINESS-TWIN contract',()=>{
  it('stores immutable compiled versions instead of duplicating canonical authorities',()=>{
    expect(migration).toContain('create table public.business_twin_versions');
    expect(migration).toContain('compile_business_twin_v1');
    expect(migration).toContain('Business Twin versions are immutable');
    expect(migration).toContain('Business Twin version insert requires governed publish');
    expect(migration).not.toMatch(/create table public\.business_twin_(services|products|prices|branches|staff|payments|knowledge)/i);
  });

  it('composes existing hierarchy, catalog, booking, locale, payment and knowledge references',()=>{
    for(const table of [
      'public.organizations','public.organization_settings','public.brands','public.tenant_businesses',
      'public.branches','public.organization_members','public.member_scope_assignments',
      'public.locale_profiles','public.market_settings','public.services','public.service_prices',
      'public.catalog_service_profiles','public.service_booking_profiles','public.catalog_products',
      'public.catalog_product_variants','public.catalog_product_prices','public.integration_connections',
      'public.knowledge_versions',
    ])expect(migration).toContain(table);
    expect(migration).toContain("'knowledgeReferences'");
    expect(migration).not.toContain("'payload',k.payload");
    expect(migration).not.toContain("'config',i.config");
  });

  it('reuses scoped configuration with a bounded Business Twin namespace and key catalog',()=>{
    expect(migration).toContain("namespace='business_twin'");
    expect(migration).toContain('guard_business_twin_scope_configuration');
    for(const key of [
      'BUSINESS_HOURS','CUSTOMER_POLICIES','REFUND_POLICY','WARRANTY_POLICY',
      'BOOKING_RULES','PAYMENT_RULES','DELIVERY_RULES','BRAND_TONE',
      'LANGUAGE_PREFERENCES','ESCALATION_RULES','OPERATIONAL_CONSTRAINTS',
    ])expect(migration).toContain("'"+key+"'");
    expect(migration).toContain('Business Twin configuration requires governed command');
  });

  it('keeps publish and configuration mutation behind service role plus human manager provenance',()=>{
    expect(migration).toContain("current_user<>'service_role'");
    expect(migration).toContain("m.role in ('OWNER','ADMIN')");
    expect(migration).toContain('BUSINESS_TWIN_CONFIGURATION_SET');
    expect(migration).toContain('BUSINESS_TWIN_CONFIGURATION_DELETED');
    expect(migration).toContain('BUSINESS_TWIN_PUBLISHED');
    expect(actions).toContain("const MANAGER_ROLES=new Set(['OWNER','ADMIN'])");
    expect(actions).toContain("rpc('publish_business_twin_v1'");
    expect(actions).toContain("rpc('set_business_twin_configuration_v1'");
  });

  it('exposes a clear operator read model without claiming a second source of truth',()=>{
    expect(page).toContain('Versioned composition of canonical business truth');
    expect(page).toContain('not another source-of-truth database');
    expect(page).toContain('Publish current truth');
    expect(page).toContain('Stored secrets and Knowledge payload bodies are deliberately excluded');
    expect(shell).toContain("['Business Twin', '/business-twin']");
  });
});
