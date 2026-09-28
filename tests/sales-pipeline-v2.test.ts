import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SALES-PIPELINE-V2 canonical commercial forecast contract', () => {
  const migration=readFileSync('supabase/migrations/0139_sales_pipeline_v2.sql','utf8');
  const runtime=readFileSync('lib/crm/deals.ts','utf8');
  const dealsApi=readFileSync('app/api/crm/deals/route.ts','utf8');
  const pipelinesApi=readFileSync('app/api/crm/pipelines/route.ts','utf8');
  const forecastApi=readFileSync('app/api/crm/pipelines/forecast/route.ts','utf8');
  const page=readFileSync('app/sales-pipeline/page.tsx','utf8');
  const actions=readFileSync('app/sales-pipeline/sales-pipeline-actions.tsx','utf8');
  const shell=readFileSync('app/app-shell.tsx','utf8');
  const ci=readFileSync('.github/workflows/ci.yml','utf8');

  it('extends the existing Deal/Pipeline authority instead of creating a parallel store',()=>{
    expect(migration).toContain('alter table public.crm_pipeline_stages');
    expect(migration).toContain('alter table public.crm_deals');
    expect(migration).not.toMatch(/create table(?: if not exists)? public\.(sales_)?pipelines_v2/i);
    expect(migration).not.toMatch(/create table(?: if not exists)? public\.deal_forecast/i);
    expect(migration).toContain('create or replace function public.guard_crm_deal_mutation');
  });

  it('adds typed stage policy and deterministic weighted forecast',()=>{
    expect(migration).toContain('default_probability_percent');
    expect(migration).toContain('requires_amount');
    expect(migration).toContain('requires_expected_close');
    expect(migration).toContain('generated always as');
    expect(migration).toContain('amount * probability_percent');
    expect(migration).toContain("forecast_source in ('STAGE_DEFAULT','MANUAL')");
  });

  it('resets manual forecast on stage movement and closes terminal semantics deterministically',()=>{
    expect(migration).toContain("new.forecast_source:='STAGE_DEFAULT'");
    expect(migration).toContain("new.probability_percent:=100");
    expect(migration).toContain("new.forecast_category:='CLOSED'");
    expect(migration).toContain("new.probability_percent:=0");
    expect(migration).toContain("new.forecast_category:='OMITTED'");
    expect(migration).toContain('CRM active stage forecast policy cannot change while it has OPEN deals');
  });

  it('reuses canonical Team IAM rather than inventing Deal-team membership',()=>{
    expect(migration).toContain('references public.teams(organization_id, id)');
    expect(migration).toContain('from public.member_scope_assignments a');
    expect(migration).toContain("a.scope_type='TEAM'");
    expect(migration).not.toMatch(/create table(?: if not exists)? public\.crm_deal_team_members/i);
  });

  it('ships a currency-safe RLS-governed forecast read model',()=>{
    expect(migration).toContain('create or replace function public.get_crm_pipeline_forecast');
    expect(migration).toContain('security invoker');
    expect(migration).toContain('d.currency');
    expect(migration).toContain('group by');
    expect(runtime).toContain('getCrmPipelineForecast');
    expect(forecastApi).toContain('getCrmPipelineForecast');
  });

  it('exposes forecast/team fields through existing Deal and Pipeline APIs',()=>{
    expect(dealsApi).toContain('ownerTeamId');
    expect(dealsApi).toContain('probabilityPercent');
    expect(dealsApi).toContain('forecastCategory');
    expect(pipelinesApi).toContain('defaultProbabilityPercent');
    expect(pipelinesApi).toContain('requiresExpectedClose');
    expect(runtime).toContain('weighted_amount');
  });

  it('ships a real operator surface instead of API-only plumbing',()=>{
    expect(shell).toContain("['Sales Pipeline', '/sales-pipeline']");
    expect(page).toContain('Sales Pipeline');
    expect(actions).toContain('Forecast summary');
    expect(actions).toContain('Create governed pipeline');
    expect(actions).toContain('Create Deal');
    expect(actions).toContain('weighted');
  });

  it('keeps AI/provider side effects outside Pipeline governance',()=>{
    const combined=migration+runtime+dealsApi+pipelinesApi+forecastApi;
    expect(combined).not.toContain('MetaCloudWhatsAppProvider');
    expect(combined).not.toContain('ResendEmailProvider');
    expect(combined).not.toMatch(/send(?:Email|Text|Template)\s*\(/);
  });

  it('runs dedicated PostgreSQL 17 V2 acceptance',()=>{
    expect(ci).toContain('sales-pipeline-v2-smoke.sql');
  });
});
