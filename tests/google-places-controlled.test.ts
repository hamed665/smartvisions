import { describe, expect, it } from 'vitest';
import { assertGooglePlacesProviderBudget } from '../lib/hunters/business/google-places-controlled';
import type { CostGuardState } from '../lib/reliability/cost-guard';

function state(overrides?: Partial<CostGuardState>): CostGuardState {
  return {
    settings: {
      organization_id: 'org-1',
      monthly_total_budget_usd: 25,
      openai_budget_usd: 10,
      google_places_budget_usd: 5,
      email_budget_usd: 4,
      whatsapp_budget_usd: 3,
      reserve_budget_usd: 3,
      daily_new_leads: 50,
      daily_website_audits: 15,
      daily_deep_ai_runs: 10,
      max_ai_runs_per_lead: 20,
      max_voice_seconds: 180,
      max_auto_retries: 1,
      warning_pct: 70,
      throttle_pct: 85,
      critical_pct: 95,
      hard_stop_pct: 100,
      audit_cache_days: 30,
      model_routing_enabled: true,
      low_cost_model: null,
      high_reasoning_model: null,
    },
    monthSpendUsd: 1,
    providerSpendUsd: { GOOGLE_PLACES: 1 },
    percentUsed: 4,
    mode: 'NORMAL',
    ...overrides,
  };
}

describe('Google Places provider budget guard', () => {
  it('allows an IDs-only discovery request inside the provider cap', () => {
    expect(() => assertGooglePlacesProviderBudget(state(), 0)).not.toThrow();
  });

  it('blocks when Google Places budget is disabled', () => {
    const s = state();
    s.settings.google_places_budget_usd = 0;
    expect(() => assertGooglePlacesProviderBudget(s, 0)).toThrow(/disabled/);
  });

  it('blocks a details reserve that would cross the provider cap', () => {
    const s = state({ providerSpendUsd: { GOOGLE_PLACES: 4.99 } });
    expect(() => assertGooglePlacesProviderBudget(s, 0.02)).toThrow(/exceeded/);
  });
});
