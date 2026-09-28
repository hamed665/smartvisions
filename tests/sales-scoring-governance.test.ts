import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CRM_LEAD_SCORING_MUTATION_ROLES,
  canMutateCrmLeadScoring,
  effectiveOpportunityScore,
} from '@/lib/crm/lead-scoring';
import { buildLeadPersistenceRow } from '@/lib/hunters/business/selective-enrichment';

describe('SALES-SCORING canonical Lead governance', () => {
  const migration = readFileSync('supabase/migrations/0138_sales_scoring_governance.sql', 'utf8');
  const api = readFileSync('app/api/crm/leads/scoring/route.ts', 'utf8');
  const panel = readFileSync('app/leads/[id]/lead-scoring-panel.tsx', 'utf8');
  const hunterAction = readFileSync('app/hunter-actions.ts', 'utf8');
  const batchAction = readFileSync('app/hunter-batch-actions.ts', 'utf8');
  const serviceFit = readFileSync('lib/hunters/business/service-fit.ts', 'utf8');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

  it('extends canonical public.leads instead of creating a second score authority', () => {
    expect(migration).toContain('alter table public.leads');
    expect(migration).not.toMatch(/create table(?: if not exists)? public\.(crm_)?lead_scores/i);
    expect(migration).not.toMatch(/create table(?: if not exists)? public\.scoring_/i);
    expect(migration).toContain('fit_score');
    expect(migration).toContain('engagement_score');
    expect(migration).toContain('scoring_revision');
  });

  it('keeps deterministic base score separate from manual effective score', () => {
    expect(effectiveOpportunityScore({ opportunityScore: 64, manualOverride: 91 })).toBe(91);
    expect(effectiveOpportunityScore({
      opportunityScore: 64,
      manualOverride: 91,
      manualOverrideExpiresAt: '2026-09-01T00:00:00.000Z',
      asOf: new Date('2026-09-28T00:00:00.000Z'),
    })).toBe(64);
    expect(migration).toContain('manual_score_override');
    expect(migration).toContain('CRM_LEAD_SCORE_OVERRIDE_SET');
    expect(migration).toContain('CRM_LEAD_SCORE_OVERRIDE_CLEARED');
  });

  it('keeps model-assisted suggestions advisory and separately versioned', () => {
    expect(migration).toContain('model_score_suggestion');
    expect(migration).toContain('record_crm_lead_model_score_suggestion');
    expect(migration).toContain("'suggestionAdvisoryOnly',true");
    expect(panel).toContain('Model suggestion · advisory only');
    expect(panel).toContain('does not overwrite the canonical base score');
  });

  it('uses a trusted mutation boundary with explicit operator roles', () => {
    expect(CRM_LEAD_SCORING_MUTATION_ROLES).toEqual(['OWNER','ADMIN','SALES_MANAGER']);
    expect(canMutateCrmLeadScoring('SALES_MANAGER')).toBe(true);
    expect(canMutateCrmLeadScoring('SALES_AGENT')).toBe(false);
    expect(migration).toContain("current_user<>'service_role'");
    expect(migration).toContain('CRM Lead scoring fields require the governed scoring mutation boundary');
    expect(api).toContain('createSupabaseServiceClient()');
  });

  it('uses existing audit_logs for idempotency/provenance rather than a score-history store', () => {
    expect(migration).toContain('audit_logs_crm_lead_scoring_request_idx');
    expect(migration).toContain('CRM_LEAD_DETERMINISTIC_SCORE_RECORDED');
    expect(migration).toContain('CRM_LEAD_ENGAGEMENT_RECOMPUTED');
    expect(migration).not.toMatch(/create table(?: if not exists)? public\.crm_lead_score_(history|events|receipts)/i);
  });

  it('stamps new Hunter scored Lead inserts with bounded source provenance', () => {
    const row = buildLeadPersistenceRow(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      {
        googlePlaceId: 'fixture-place',
        name: 'Fixture Business',
        businessStatus: 'OPERATIONAL',
        officialWebsite: null,
        nationalPhoneNumber: '+968 0000 0000',
        internationalPhoneNumber: '+96800000000',
      } as never,
      '00000000-0000-0000-0000-000000000002',
    );
    expect(row.scoring_source).toBe('HUNTER_NO_WEBSITE_V1');
    expect(row.scoring_policy_version).toBe('sales-scoring-v1');
    expect(row.scoring_revision).toBe(1);
    expect(row.scoring_updated_by_user_id).toBe('00000000-0000-0000-0000-000000000002');
    expect(row.scoring_evidence).not.toHaveProperty('phone');
    expect(serviceFit).toContain("scoring_source: 'HUNTER_SERVICE_FIT_V1'");
    expect(serviceFit).toContain('fit_score: input.qualification.serviceFitScore');
  });

  it('routes scored Hunter promotion through the trusted service boundary', () => {
    expect(hunterAction).toContain("scoringService.from('leads').insert");
    expect(batchAction).toContain("scoringService.from('leads').insert");
    expect(hunterAction).toContain('createSupabaseServiceClient');
    expect(batchAction).toContain('createSupabaseServiceClient');
  });

  it('ships real API/operator controls and a PostgreSQL 17 smoke contract', () => {
    expect(api).toContain("action === 'RECOMPUTE_ENGAGEMENT'");
    expect(api).toContain("action === 'SET_OVERRIDE'");
    expect(api).toContain("action === 'CLEAR_OVERRIDE'");
    expect(api).toContain("action === 'RECORD_MODEL_SUGGESTION'");
    expect(panel).toContain('Recompute engagement');
    expect(panel).toContain('Set override');
    expect(ci).toContain('sales-scoring-governance-smoke.sql');
  });
});
