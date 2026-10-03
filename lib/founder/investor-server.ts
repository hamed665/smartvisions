import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  FounderFundraisingRoundV1,
  FounderInvestorCandidateV1,
  FounderInvestorCrmBusinessOption,
  FounderInvestorCrmPersonOption,
  FounderInvestorPipelineDealV1,
  FounderInvestorPipelineStageV1,
  FounderInvestorWorkspaceV1,
} from './investor';

function nullableNumber(value: unknown) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalString(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function candidateState(value: unknown): FounderInvestorCandidateV1['recordState'] {
  return value === 'CRM_CONFIRMED' ? 'CRM_CONFIRMED' : 'DISCOVERED_EXTERNAL';
}

export async function loadFounderInvestorWorkspaceV1(input: {
  supabase: SupabaseClient;
  organizationId: string;
  now?: Date;
}): Promise<FounderInvestorWorkspaceV1> {
  const db = input.supabase;
  const org = input.organizationId;
  const now = input.now ?? new Date();

  const [roundsResult, candidatesResult, pipelineResult, businessesResult, peopleResult] = await Promise.all([
    db.from('founder_fundraising_rounds')
      .select('id,name,status,instrument,currency,target_raise,pre_money_valuation_assumption,valuation_cap_assumption,discount_bps_assumption,target_runway_months_assumption,use_of_funds,assumption_source_ref,notes,version,updated_at')
      .eq('organization_id', org)
      .order('updated_at', { ascending: false })
      .limit(30),
    db.from('founder_investor_research_candidates')
      .select('id,record_state,fund_name,person_name,geography,stage_fit,ticket_min,ticket_max,currency,sector_fit,ai_saas_fit,mena_gcc_fit,source_url,source_title,last_verified_at,business_id,person_id,confirmation_method,confirmed_at,notes,version,updated_at')
      .eq('organization_id', org)
      .order('last_verified_at', { ascending: false })
      .limit(150),
    db.from('crm_pipelines')
      .select('id,name,status,created_at')
      .eq('organization_id', org)
      .eq('pipeline_purpose', 'FUNDRAISING')
      .in('status', ['DRAFT', 'ACTIVE'])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    db.from('businesses')
      .select('id,name,country_code,city,updated_at')
      .eq('organization_id', org)
      .order('updated_at', { ascending: false })
      .limit(200),
    db.from('crm_people')
      .select('id,display_name,status,updated_at')
      .eq('organization_id', org)
      .eq('status', 'ACTIVE')
      .order('updated_at', { ascending: false })
      .limit(200),
  ]);

  const firstError = [
    roundsResult.error,
    candidatesResult.error,
    pipelineResult.error,
    businessesResult.error,
    peopleResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(`Founder Investor workspace read failed: ${firstError.message}`);

  const businesses: FounderInvestorCrmBusinessOption[] = (businessesResult.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? 'Unnamed business'),
    countryCode: String(row.country_code ?? ''),
    city: optionalString(row.city),
  }));
  const businessNames = new Map(businesses.map((item) => [item.id, item.name]));

  const people: FounderInvestorCrmPersonOption[] = (peopleResult.data ?? []).map((row) => ({
    id: String(row.id),
    displayName: optionalString(row.display_name) ?? 'Unnamed person',
  }));

  const pipelineRow = pipelineResult.data;
  let stages: FounderInvestorPipelineStageV1[] = [];
  let deals: FounderInvestorPipelineDealV1[] = [];

  if (pipelineRow?.id) {
    const [stagesResult, dealsResult] = await Promise.all([
      db.from('crm_pipeline_stages')
        .select('id,name,position,category,probability_bps,forecast_category,require_amount,require_expected_close')
        .eq('organization_id', org)
        .eq('pipeline_id', pipelineRow.id)
        .eq('is_active', true)
        .order('position', { ascending: true }),
      db.from('crm_deals')
        .select('id,business_id,person_id,stage_id,title,state,amount,currency,expected_close_at,lost_reason,won_at,lost_at,metadata,version,updated_at,fundraising_round_id')
        .eq('organization_id', org)
        .eq('pipeline_id', pipelineRow.id)
        .eq('deal_purpose', 'FUNDRAISING')
        .order('updated_at', { ascending: false })
        .limit(200),
    ]);
    const pipelineError = stagesResult.error ?? dealsResult.error;
    if (pipelineError) throw new Error(`Founder Investor pipeline read failed: ${pipelineError.message}`);

    stages = (stagesResult.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      position: Number(row.position ?? 0),
      category: row.category === 'WON' ? 'WON' : row.category === 'LOST' ? 'LOST' : 'OPEN',
      probabilityBps: Number(row.probability_bps ?? 0),
      forecastCategory: String(row.forecast_category ?? ''),
      requireAmount: row.require_amount === true,
      requireExpectedClose: row.require_expected_close === true,
    }));
    const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));

    deals = (dealsResult.data ?? []).map((row) => {
      const metadata = object(row.metadata);
      const candidateId = typeof metadata.founderInvestorCandidateId === 'string'
        ? metadata.founderInvestorCandidateId
        : null;
      const businessId = String(row.business_id);
      return {
        id: String(row.id),
        candidateId,
        fundraisingRoundId: String(row.fundraising_round_id ?? ''),
        businessId,
        businessName: businessNames.get(businessId) ?? 'Unknown CRM business',
        personId: optionalString(row.person_id),
        title: String(row.title ?? ''),
        stageId: String(row.stage_id),
        stageName: stageNames.get(String(row.stage_id)) ?? 'Unknown stage',
        state: row.state === 'WON' ? 'WON' : row.state === 'LOST' ? 'LOST' : 'OPEN',
        amount: nullableNumber(row.amount),
        currency: optionalString(row.currency),
        expectedCloseAt: optionalString(row.expected_close_at),
        lostReason: optionalString(row.lost_reason),
        wonAt: optionalString(row.won_at),
        lostAt: optionalString(row.lost_at),
        version: Number(row.version ?? 1),
        updatedAt: String(row.updated_at ?? now.toISOString()),
        evidenceClass: 'CRM_CONFIRMED' as const,
      };
    });
  }

  const rounds: FounderFundraisingRoundV1[] = (roundsResult.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    status: row.status === 'ACTIVE'
      ? 'ACTIVE'
      : row.status === 'PAUSED'
        ? 'PAUSED'
        : row.status === 'CLOSED'
          ? 'CLOSED'
          : row.status === 'CANCELED'
            ? 'CANCELED'
            : 'DRAFT',
    instrument: row.instrument === 'SAFE'
      ? 'SAFE'
      : row.instrument === 'CONVERTIBLE_NOTE'
        ? 'CONVERTIBLE_NOTE'
        : row.instrument === 'OTHER'
          ? 'OTHER'
          : 'EQUITY',
    currency: String(row.currency ?? ''),
    targetRaise: nullableNumber(row.target_raise) ?? 0,
    preMoneyValuationAssumption: nullableNumber(row.pre_money_valuation_assumption),
    valuationCapAssumption: nullableNumber(row.valuation_cap_assumption),
    discountBpsAssumption: nullableNumber(row.discount_bps_assumption),
    targetRunwayMonthsAssumption: nullableNumber(row.target_runway_months_assumption),
    useOfFunds: object(row.use_of_funds),
    assumptionSourceRef: String(row.assumption_source_ref ?? ''),
    notes: optionalString(row.notes),
    evidenceClass: 'ASSUMPTION' as const,
    version: Number(row.version ?? 1),
    updatedAt: String(row.updated_at ?? now.toISOString()),
  }));

  const candidates: FounderInvestorCandidateV1[] = (candidatesResult.data ?? []).map((row) => {
    const recordState = candidateState(row.record_state);
    return {
      id: String(row.id),
      recordState,
      fundName: String(row.fund_name ?? ''),
      personName: optionalString(row.person_name),
      geography: optionalString(row.geography),
      stageFit: optionalString(row.stage_fit),
      ticketMin: nullableNumber(row.ticket_min),
      ticketMax: nullableNumber(row.ticket_max),
      currency: optionalString(row.currency),
      sectorFit: optionalString(row.sector_fit),
      aiSaasFit: typeof row.ai_saas_fit === 'boolean' ? row.ai_saas_fit : null,
      menaGccFit: typeof row.mena_gcc_fit === 'boolean' ? row.mena_gcc_fit : null,
      sourceUrl: String(row.source_url ?? ''),
      sourceTitle: optionalString(row.source_title),
      lastVerifiedAt: String(row.last_verified_at ?? now.toISOString()),
      businessId: optionalString(row.business_id),
      personId: optionalString(row.person_id),
      confirmationMethod: row.confirmation_method === 'MANUAL_CONFIRMED'
        ? 'MANUAL_CONFIRMED'
        : row.confirmation_method === 'IMPORT_VERIFIED'
          ? 'IMPORT_VERIFIED'
          : null,
      confirmedAt: optionalString(row.confirmed_at),
      notes: optionalString(row.notes),
      evidenceClass: recordState === 'CRM_CONFIRMED' ? 'CRM_CONFIRMED' : 'EXTERNAL_RESEARCH',
      version: Number(row.version ?? 1),
      updatedAt: String(row.updated_at ?? now.toISOString()),
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    rounds,
    candidates,
    pipeline: {
      id: pipelineRow?.id ? String(pipelineRow.id) : null,
      name: pipelineRow?.name ? String(pipelineRow.name) : null,
      status: pipelineRow?.status === 'ACTIVE' ? 'ACTIVE' : pipelineRow?.status === 'DRAFT' ? 'DRAFT' : null,
      stages,
      deals,
    },
    crmOptions: { businesses, people },
    evidence: [
      {
        authority: 'FUNDRAISING_STRUCTURE',
        quality: 'VERIFIED',
        evidenceClass: 'VERIFIED_PRODUCTION',
        count: rounds.length,
        detail: 'Production founder_fundraising_rounds authority queried successfully. Round values are OWNER assumptions unless separately evidenced.',
      },
      {
        authority: 'INVESTOR_RESEARCH',
        quality: 'VERIFIED',
        evidenceClass: 'VERIFIED_PRODUCTION',
        count: candidates.length,
        detail: 'Production investor research authority queried successfully. DISCOVERED_EXTERNAL rows are not investor interest or CRM identity facts.',
      },
      {
        authority: 'INVESTOR_PIPELINE',
        quality: 'VERIFIED',
        evidenceClass: 'VERIFIED_PRODUCTION',
        count: deals.length,
        detail: 'Canonical CRM FUNDRAISING pipeline queried successfully. Deal stage records are workflow evidence, not a probability of raising capital.',
      },
    ],
  };
}
