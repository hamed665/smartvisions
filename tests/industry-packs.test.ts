import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const migration=readFileSync('supabase/migrations/0181_industry_packs.sql','utf8');
const page=readFileSync('app/industry-packs/page.tsx','utf8');
const actions=readFileSync('app/industry-packs/actions.ts','utf8');
const twinActions=readFileSync('app/business-twin/actions.ts','utf8');
const shell=readFileSync('app/app-shell.tsx','utf8');

const PACK_KEYS=[
  'dental_medical','pet_clinic','automotive','beauty_wellness','restaurant_cafe',
  'home_services','real_estate','education','retail_professional',
];

describe('BRAIN-INDUSTRY-PACKS contract',()=>{
  it('ships the required vertical catalog as versioned product configuration',()=>{
    expect(migration).toContain('create table public.industry_packs');
    expect(migration).toContain('create table public.industry_pack_versions');
    for(const key of PACK_KEYS) expect(migration).toContain(`('${key}',1,md5`);
    expect(migration).toContain('manifest_hash=md5(manifest::text)');
    expect(migration).toContain('migration-versioned and immutable at runtime');
  });

  it('keeps Pack activation separate from operational CRM, Catalog, Booking, Payment and Automation truth',()=>{
    expect(migration).toContain('create table public.industry_pack_activations');
    expect(migration).not.toContain('create table public.industry_pack_leads');
    expect(migration).not.toContain('create table public.industry_pack_deals');
    expect(migration).not.toContain('create table public.industry_pack_bookings');
    expect(migration).not.toContain('create table public.industry_pack_payments');
    expect(migration).not.toContain('create table public.industry_pack_automations');
    expect(migration).not.toContain('insert into public.crm_custom_field_definitions');
    expect(migration).not.toContain('insert into public.crm_pipelines');
    expect(migration).not.toContain('insert into public.automation_rules');
    expect(page).toContain('Activation does not create operational CRM fields');
    expect(page).toContain('must be materialized deliberately through their own contracts');
  });

  it('validates blueprints against currently available canonical runtime contracts',()=>{
    expect(migration).toContain('get_industry_pack_readiness_v1');
    expect(migration).toContain("t.availability='AVAILABLE'");
    for(const trigger of ['BOOKING_CONFIRMED','DEAL_STAGE_CHANGED','ORDER_STATUS_CHANGED','SCHEDULE_DUE','TASK_STATUS_CHANGED']){
      expect(migration).toContain(`"triggerKey":"${trigger}"`);
    }
    for(const invalid of ['BOOKING_COMPLETED','ORDER_COMPLETED','FIELD_SERVICE_STATUS_CHANGED','QUOTE_ISSUED']){
      expect(migration).not.toContain(`"triggerKey":"${invalid}"`);
    }
    expect(migration).toContain('Industry Pack manifest is not compatible with current canonical runtime');
    expect(page).toContain('Canonical readiness:');
  });

  it('treats future custom objects as explicit dependencies rather than inventing a parallel object store',()=>{
    expect(migration).toContain("'pendingCustomObjects'");
    expect(migration).toContain("'DEPENDENCY_PENDING'");
    expect(migration).toContain('FUTURE_CUSTOM_OBJECT');
    expect(migration).toContain('EXTERNAL_OR_FUTURE_CUSTOM_OBJECT');
  });

  it('governs Business-scoped activation and carries only Pack references into Business Twin V2',()=>{
    expect(migration).toContain('activate_industry_pack_v1');
    expect(migration).toContain('deactivate_industry_pack_v1');
    expect(migration).toContain("m.role in ('OWNER','ADMIN')");
    expect(migration).toContain('resolve_industry_pack_context_v1');
    expect(migration).toContain('compile_business_twin_v2');
    expect(migration).toContain('industryPackReferences');
    expect(twinActions).toContain("rpc('publish_business_twin_v2'");
    expect(actions).toContain("rpc('activate_industry_pack_v1'");
    expect(shell).toContain("['Industry Packs', '/industry-packs']");
  });
});
