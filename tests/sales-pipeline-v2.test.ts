import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { CrmForecastCategory } from '@/lib/crm/deals';

describe('SALES-PIPELINE-V2 governance', () => {
  const migration = readFileSync('supabase/migrations/0139_sales_pipeline_v2.sql','utf8');
  const deals = readFileSync('lib/crm/deals.ts','utf8');
  const pipelineApi = readFileSync('app/api/crm/pipelines/route.ts','utf8');
  const dealApi = readFileSync('app/api/crm/deals/route.ts','utf8');
  const forecastApi = readFileSync('app/api/crm/deals/forecast/route.ts','utf8');
  const ci = readFileSync('.github/workflows/ci.yml','utf8');

  it('extends canonical Pipeline/Stage/Deal and Team authorities only', () => {
    expect(migration).toContain('alter table public.crm_pipeline_stages');
    expect(migration).toContain('alter table public.crm_deals');
    expect(migration).toContain('references public.teams(organization_id,id)');
    expect(migration).not.toMatch(/create table(?: if not exists)? public\.(?:sales_)?pipelines_v2/i);
    expect(migration).not.toMatch(/create table(?: if not exists)? public\.(?:sales_)?deal_scores/i);
    expect(migration).not.toMatch(/create table(?: if not exists)? public\.sales_teams/i);
  });

  it('uses basis-point probability and computes weighted amount instead of persisting a second truth', () => {
    expect(migration).toContain('probability_bps');
    expect(migration).toContain('probability_override_bps');
    expect(migration).toContain('weighted_amount');
    expect(migration).toContain('crm_deal_forecast_rows');
    expect(migration).not.toMatch(/add column if not exists weighted_amount/i);
  });

  it('makes terminal stage semantics deterministic', () => {
    expect(migration).toContain("WON CRM pipeline stage requires 10000 bps CLOSED_WON");
    expect(migration).toContain("LOST CRM pipeline stage requires 0 bps CLOSED_LOST");
    expect(migration).toContain("CRM Deal must enter Pipeline through an OPEN stage");
    expect(migration).toContain("terminal CRM Deal V2 forecast/close evidence is immutable");
  });

  it('requires bounded typed close evidence without duplicating commercial history', () => {
    expect(migration).toContain("'CUSTOMER_CONFIRMATION'");
    expect(migration).toContain("'PAYMENT'");
    expect(migration).toContain("'CONTRACT'");
    expect(migration).toContain("'OPERATOR_CONFIRMED'");
    expect(migration).toContain('CRM_DEAL_CLOSE_EVIDENCE_RECORDED');
    expect(migration).not.toMatch(/create table(?: if not exists)? public\.crm_deal_(?:close_)?history/i);
  });

  it('supports typed stage policies and canonical team assignment', () => {
    const categories: CrmForecastCategory[] = ['PIPELINE','BEST_CASE','COMMIT','CLOSED_WON','CLOSED_LOST'];
    expect(categories).toHaveLength(5);
    expect(migration).toContain('require_amount');
    expect(migration).toContain('require_expected_close');
    expect(migration).toContain('allow_probability_override');
    expect(deals).toContain('team_id: string | null');
    expect(dealApi).toContain('probabilityOverrideBps');
    expect(dealApi).toContain('closeEvidence');
  });

  it('exposes bounded forecast summary through the existing CRM surface', () => {
    expect(deals).toContain('getCrmPipelineForecast');
    expect(migration).toContain('get_crm_pipeline_forecast');
    expect(forecastApi).toContain('getCrmPipelineForecast');
    expect(forecastApi).toContain("Cache-Control': 'private, no-store");
  });

  it('requires explicit OPEN-stage probability and forecast category at the HTTP boundary', () => {
    expect(pipelineApi).toContain('probabilityBps');
    expect(pipelineApi).toContain('forecastCategory');
    expect(pipelineApi).toContain('OPEN_FORECAST_CATEGORIES');
  });

  it('ships PostgreSQL 17 acceptance for the V2 contract', () => {
    expect(ci).toContain('sales-pipeline-v2-smoke.sql');
  });
});
