import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/0074_crm_deal_pipeline_foundation.sql', import.meta.url),
  'utf8',
);
const dealRoute = readFileSync(
  new URL('../app/api/crm/deals/route.ts', import.meta.url),
  'utf8',
);
const pipelineRoute = readFileSync(
  new URL('../app/api/crm/pipelines/route.ts', import.meta.url),
  'utf8',
);
const historyRoute = readFileSync(
  new URL('../app/api/crm/deals/history/route.ts', import.meta.url),
  'utf8',
);
const runtime = readFileSync(
  new URL('../lib/crm/deals.ts', import.meta.url),
  'utf8',
);
const stateCatalog = readFileSync(
  new URL('../docs/business-os-2027/STATE_EVENT_CATALOG.md', import.meta.url),
  'utf8',
);

describe('Business OS CRM Deal + Pipeline foundation', () => {
  it('creates dedicated commercial truth without repurposing acquisition opportunities', () => {
    expect(migration).toContain('create table if not exists public.crm_pipelines');
    expect(migration).toContain('create table if not exists public.crm_pipeline_stages');
    expect(migration).toContain('create table if not exists public.crm_deals');
    expect(migration).not.toContain('alter table public.growth_opportunities rename');
    expect(migration).not.toContain('alter table public.intent_opportunities rename');
    expect(migration).not.toContain('insert into public.crm_deals select');
  });

  it('keeps Deal aggregate state separate from configurable Pipeline stages', () => {
    expect(migration).toContain("state in ('OPEN','WON','LOST')");
    expect(migration).toContain("category in ('OPEN','WON','LOST')");
    expect(migration).toContain('crm_pipeline_stages_one_won_uidx');
    expect(migration).toContain('crm_pipeline_stages_one_lost_uidx');
    expect(stateCatalog).toContain('Aggregate states:');
    expect(stateCatalog).toContain('Pipeline stages are configurable ordered labels');
  });

  it('enforces tenant-consistent Business, Lead, Pipeline, Stage and owner scope', () => {
    expect(migration).toContain(
      'foreign key (organization_id, lead_id, business_id)',
    );
    expect(migration).toContain(
      'foreign key (organization_id, stage_id, pipeline_id)',
    );
    expect(migration).toContain(
      'foreign key (organization_id, owner_user_id)',
    );
  });

  it('has explicit Lead conversion with idempotent request keys', () => {
    expect(migration).toContain('create or replace function public.create_crm_deal_from_lead');
    expect(migration).toContain("source_type = 'LEAD'");
    expect(migration).toContain('source_id = lead_id::text');
    expect(migration).toContain('unique (organization_id, request_key)');
    expect(runtime).toContain('createCrmDealFromLead');
    expect(dealRoute).toContain("mode !== 'MANUAL' && mode !== 'LEAD_CONVERSION'");
  });

  it('freezes terminal commercial truth', () => {
    expect(migration).toContain("'terminal CRM deal stage is immutable'");
    expect(migration).toContain("'terminal CRM deal commercial truth is immutable'");
    expect(migration).toContain("'CRM LOST deal requires lost_reason'");
  });

  it('uses existing audit_logs for immutable stage history', () => {
    expect(migration).toContain('create or replace view public.crm_deal_stage_history');
    expect(migration).toContain('with (security_invoker = true)');
    expect(migration).toContain("a.entity_type = 'crm_deals'");
    expect(migration).toContain("'CRM_DEAL_STAGE_CHANGED'");
    expect(migration).not.toContain('create table if not exists public.crm_deal_events');
  });

  it('uses authenticated RLS and no DELETE or service-role browser grants', () => {
    expect(migration).toContain('alter table public.crm_deals enable row level security');
    expect(migration).toContain('crm_deals_member_read');
    expect(migration).toContain('crm_deals_manager_insert');
    expect(migration).toContain('crm_deals_manager_update');
    expect(migration).not.toContain('grant delete on public.crm_deals');
    expect(migration).not.toContain('grant select, insert, update on public.crm_deals to service_role');
    expect(migration).not.toContain('security definer');
  });

  it('keeps all APIs on signed-in session and provider-free paths', () => {
    for (const route of [dealRoute,pipelineRoute,historyRoute]) {
      expect(route).toContain("import { createClient } from '@/lib/supabase/server'");
      expect(route).toContain('supabase.auth.getUser()');
      expect(route).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
      expect(route).not.toContain('SUPABASE_SECRET_KEY');
    }

    const combined = migration + dealRoute + pipelineRoute + historyRoute + runtime;
    expect(combined).not.toContain('MetaCloudWhatsAppProvider');
    expect(combined).not.toContain('ResendEmailProvider');
    expect(combined).not.toMatch(/send(?:Email|Text|Template)\s*\(/);
  });
});
