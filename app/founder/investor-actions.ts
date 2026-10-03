'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentOrganization } from '@/lib/supabase/org';

function required(form: FormData, key: string) {
  const value = String(form.get(key) ?? '').trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function optional(form: FormData, key: string) {
  const value = String(form.get(key) ?? '').trim();
  return value || null;
}

function bounded(value: string | null, key: string, max: number) {
  if (value && value.length > max) throw new Error(`${key} is too long`);
  return value;
}

function uuid(value: string | null, key: string) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${key} is invalid`);
  }
  return value;
}

function nonNegativeValue(value: string | null, key: string) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${key} must be non-negative`);
  return parsed;
}

function nonNegative(form: FormData, key: string) {
  const value = nonNegativeValue(required(form, key), key);
  if (value == null) throw new Error(`${key} is required`);
  return value;
}

function optionalNonNegative(form: FormData, key: string) {
  return nonNegativeValue(optional(form, key), key);
}

function currencyValue(value: string | null, requiredValue = false) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!normalized && !requiredValue) return null;
  if (!/^[A-Z]{3}$/.test(normalized)) throw new Error('currency must be a three-letter ISO code');
  return normalized;
}

function percentToBps(form: FormData, key: string) {
  const value = optionalNonNegative(form, key);
  if (value == null) return null;
  if (value > 100) throw new Error(`${key} must be between 0 and 100`);
  return Math.round(value * 100);
}

function dateOnlyToIso(value: string | null, key: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${key} must be a date`);
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${key} is invalid`);
  return parsed.toISOString();
}

function optionalBoolean(form: FormData, key: string) {
  const value = String(form.get(key) ?? '').trim().toUpperCase();
  if (value === 'YES') return true;
  if (value === 'NO') return false;
  return null;
}

function normalizedUrl(value: string) {
  if (value.length > 2048) throw new Error('source_url is too long');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('source_url must be a valid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('source_url must use http or https');
  return url.toString();
}

async function ownerContext() {
  const ctx = await getCurrentOrganization(true);
  if (!ctx.userId || ctx.role !== 'OWNER') throw new Error('Owner permission required');
  return ctx;
}

export async function saveFounderFundraisingRound(form: FormData) {
  const ctx = await ownerContext();
  const idRaw = optional(form, 'id');
  const version = Number(form.get('version') ?? 0);
  const status = required(form, 'status').toUpperCase();
  const instrument = required(form, 'instrument').toUpperCase();
  if (!['DRAFT','ACTIVE','PAUSED','CLOSED','CANCELED'].includes(status)) throw new Error('Invalid fundraising status');
  if (!['EQUITY','SAFE','CONVERTIBLE_NOTE','OTHER'].includes(instrument)) throw new Error('Invalid fundraising instrument');

  const allocations = {
    product: optionalNonNegative(form, 'use_product_pct') ?? 0,
    goToMarket: optionalNonNegative(form, 'use_gtm_pct') ?? 0,
    operations: optionalNonNegative(form, 'use_operations_pct') ?? 0,
    other: optionalNonNegative(form, 'use_other_pct') ?? 0,
  };
  const allocationTotal = Object.values(allocations).reduce((sum, value) => sum + value, 0);
  if (allocationTotal > 100.001) throw new Error('Use-of-funds allocation cannot exceed 100%');

  const payload = {
    name: required(form, 'name').slice(0, 160),
    status,
    instrument,
    currency: currencyValue(required(form, 'currency'), true),
    target_raise: nonNegative(form, 'target_raise'),
    pre_money_valuation_assumption: optionalNonNegative(form, 'pre_money_valuation_assumption'),
    valuation_cap_assumption: optionalNonNegative(form, 'valuation_cap_assumption'),
    discount_bps_assumption: percentToBps(form, 'discount_pct_assumption'),
    target_runway_months_assumption: optionalNonNegative(form, 'target_runway_months_assumption'),
    use_of_funds: {
      allocationPct: allocations,
      totalPct: Number(allocationTotal.toFixed(2)),
      evidenceClass: 'ASSUMPTION',
    },
    assumption_source_ref: bounded(required(form, 'assumption_source_ref'), 'assumption_source_ref', 512),
    assumption_evidence: {
      confirmation: 'OWNER_ASSUMPTION',
      recordedAt: new Date().toISOString(),
    },
    notes: bounded(optional(form, 'notes'), 'notes', 4000),
    updated_by_user_id: ctx.userId,
  };

  if (idRaw) {
    const id = uuid(idRaw, 'id');
    if (!Number.isInteger(version) || version < 1) throw new Error('Invalid fundraising round version');
    const { data, error } = await ctx.supabase
      .from('founder_fundraising_rounds')
      .update(payload)
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .eq('version', version)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`Fundraising round update failed: ${error.message}`);
    if (!data) throw new Error('Fundraising round version conflict');
  } else {
    if ((payload.target_raise ?? 0) <= 0) throw new Error('target_raise must be greater than zero');
    const { error } = await ctx.supabase.from('founder_fundraising_rounds').insert({
      organization_id: ctx.organizationId,
      ...payload,
      created_by_user_id: ctx.userId,
    });
    if (error) throw new Error(`Fundraising round create failed: ${error.message}`);
  }
  revalidatePath('/founder');
}

export async function recordFounderInvestorResearchCandidate(form: FormData) {
  const ctx = await ownerContext();
  const ticketMin = optionalNonNegative(form, 'ticket_min');
  const ticketMax = optionalNonNegative(form, 'ticket_max');
  if (ticketMin != null && ticketMax != null && ticketMax < ticketMin) {
    throw new Error('ticket_max must be greater than or equal to ticket_min');
  }
  const ticketCurrency = currencyValue(optional(form, 'currency'), ticketMin != null || ticketMax != null);
  const lastVerifiedAt = dateOnlyToIso(required(form, 'last_verified_date'), 'last_verified_date');

  const { error } = await ctx.supabase.from('founder_investor_research_candidates').insert({
    organization_id: ctx.organizationId,
    record_state: 'DISCOVERED_EXTERNAL',
    fund_name: required(form, 'fund_name').slice(0, 240),
    person_name: bounded(optional(form, 'person_name'), 'person_name', 200),
    geography: bounded(optional(form, 'geography'), 'geography', 160),
    stage_fit: bounded(optional(form, 'stage_fit'), 'stage_fit', 160),
    ticket_min: ticketMin,
    ticket_max: ticketMax,
    currency: ticketCurrency,
    sector_fit: bounded(optional(form, 'sector_fit'), 'sector_fit', 500),
    ai_saas_fit: optionalBoolean(form, 'ai_saas_fit'),
    mena_gcc_fit: optionalBoolean(form, 'mena_gcc_fit'),
    source_url: normalizedUrl(required(form, 'source_url')),
    source_title: bounded(optional(form, 'source_title'), 'source_title', 500),
    last_verified_at: lastVerifiedAt,
    notes: bounded(optional(form, 'notes'), 'notes', 4000),
    created_by_user_id: ctx.userId,
    updated_by_user_id: ctx.userId,
  });
  if (error) throw new Error(`Investor research record failed: ${error.message}`);
  revalidatePath('/founder');
}

export async function ensureFounderFundraisingPipeline(form: FormData) {
  const ctx = await ownerContext();
  const name = bounded(optional(form, 'name') ?? 'Investor Fundraising', 'name', 160)!;
  const { error } = await ctx.supabase.rpc('ensure_founder_fundraising_pipeline', {
    p_organization_id: ctx.organizationId,
    p_name: name,
  });
  if (error) throw new Error(`Fundraising pipeline bootstrap failed: ${error.message}`);
  revalidatePath('/founder');
}

export async function confirmFounderInvestorCandidateToCrm(form: FormData) {
  const ctx = await ownerContext();
  const candidateId = uuid(required(form, 'candidate_id'), 'candidate_id');
  const version = Number(required(form, 'version'));
  const businessId = uuid(required(form, 'business_id'), 'business_id');
  const personRaw = optional(form, 'person_id');
  const personId = personRaw ? uuid(personRaw, 'person_id') : null;
  if (!Number.isInteger(version) || version < 1) throw new Error('Invalid candidate version');

  const [candidateResult, businessResult] = await Promise.all([
    ctx.supabase.from('founder_investor_research_candidates')
      .select('id,record_state,version')
      .eq('organization_id', ctx.organizationId)
      .eq('id', candidateId)
      .maybeSingle(),
    ctx.supabase.from('businesses')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('id', businessId)
      .maybeSingle(),
  ]);
  if (candidateResult.error) throw new Error(`Investor candidate read failed: ${candidateResult.error.message}`);
  if (businessResult.error) throw new Error(`CRM business read failed: ${businessResult.error.message}`);
  if (!candidateResult.data || candidateResult.data.record_state !== 'DISCOVERED_EXTERNAL' || Number(candidateResult.data.version) !== version) {
    throw new Error('Investor candidate version/state conflict');
  }
  if (!businessResult.data) throw new Error('CRM business not found');

  if (personId) {
    const { data, error } = await ctx.supabase.from('crm_person_business_relationships')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('business_id', businessId)
      .eq('person_id', personId)
      .eq('status', 'ACTIVE')
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`CRM relationship read failed: ${error.message}`);
    if (!data) throw new Error('Selected CRM person is not confirmed as related to the selected business');
  }

  const { data, error } = await ctx.supabase
    .from('founder_investor_research_candidates')
    .update({
      record_state: 'CRM_CONFIRMED',
      business_id: businessId,
      person_id: personId,
      confirmation_method: 'MANUAL_CONFIRMED',
      confirmed_by_user_id: ctx.userId,
      confirmed_at: new Date().toISOString(),
      updated_by_user_id: ctx.userId,
    })
    .eq('organization_id', ctx.organizationId)
    .eq('id', candidateId)
    .eq('version', version)
    .eq('record_state', 'DISCOVERED_EXTERNAL')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Investor CRM confirmation failed: ${error.message}`);
  if (!data) throw new Error('Investor candidate version conflict');
  revalidatePath('/founder');
}

export async function createFounderInvestorPipelineEntry(form: FormData) {
  const ctx = await ownerContext();
  const candidateId = uuid(required(form, 'candidate_id'), 'candidate_id');
  const roundId = uuid(required(form, 'round_id'), 'round_id');
  const amount = optionalNonNegative(form, 'amount');
  const currency = amount == null
    ? null
    : currencyValue(optional(form, 'currency') ?? required(form, 'round_currency'), true);
  const expectedCloseAt = dateOnlyToIso(optional(form, 'expected_close_date'), 'expected_close_date');

  const [candidateResult, roundResult] = await Promise.all([
    ctx.supabase.from('founder_investor_research_candidates')
      .select('id,record_state,fund_name,business_id,person_id')
      .eq('organization_id', ctx.organizationId)
      .eq('id', candidateId)
      .maybeSingle(),
    ctx.supabase.from('founder_fundraising_rounds')
      .select('id,name,status,currency')
      .eq('organization_id', ctx.organizationId)
      .eq('id', roundId)
      .maybeSingle(),
  ]);
  if (candidateResult.error) throw new Error(`Investor candidate read failed: ${candidateResult.error.message}`);
  if (roundResult.error) throw new Error(`Fundraising round read failed: ${roundResult.error.message}`);
  const candidate = candidateResult.data;
  const round = roundResult.data;
  if (!candidate || candidate.record_state !== 'CRM_CONFIRMED' || !candidate.business_id) {
    throw new Error('Investor candidate must be CRM_CONFIRMED before entering the pipeline');
  }
  if (!round || !['DRAFT','ACTIVE'].includes(String(round.status))) {
    throw new Error('Fundraising round must be DRAFT or ACTIVE');
  }

  const requestKey = `founder-investor:${candidateId}:${roundId}`;
  const { data: existing, error: existingError } = await ctx.supabase.from('crm_deals')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('request_key', requestKey)
    .maybeSingle();
  if (existingError) throw new Error(`Investor pipeline replay check failed: ${existingError.message}`);
  if (existing) {
    revalidatePath('/founder');
    return;
  }

  const { data: pipelineId, error: pipelineError } = await ctx.supabase.rpc('ensure_founder_fundraising_pipeline', {
    p_organization_id: ctx.organizationId,
    p_name: 'Investor Fundraising',
  });
  if (pipelineError || !pipelineId) {
    throw new Error(`Fundraising pipeline bootstrap failed: ${pipelineError?.message ?? 'pipeline id missing'}`);
  }

  const { data: stage, error: stageError } = await ctx.supabase.from('crm_pipeline_stages')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('pipeline_id', pipelineId)
    .eq('name', 'IDENTIFIED')
    .eq('is_active', true)
    .maybeSingle();
  if (stageError) throw new Error(`Fundraising stage read failed: ${stageError.message}`);
  if (!stage) throw new Error('IDENTIFIED fundraising stage missing');

  const now = new Date().toISOString();
  const personContext = candidate.person_id ? {
    person_id: candidate.person_id,
    person_link_method: 'MANUAL_CONFIRMED',
    person_link_source_ref: `founder-investor-candidate:${candidateId}`,
    person_link_evidence: {
      candidateId,
      confirmation: 'OWNER_MANUAL_CONFIRMED',
    },
    person_linked_by_user_id: ctx.userId,
    person_linked_at: now,
  } : {};

  const { error } = await ctx.supabase.from('crm_deals').insert({
    organization_id: ctx.organizationId,
    business_id: candidate.business_id,
    pipeline_id: pipelineId,
    stage_id: stage.id,
    title: `${String(candidate.fund_name).slice(0, 150)} · ${String(round.name).slice(0, 80)}`.slice(0, 240),
    state: 'OPEN',
    amount,
    currency: currency ?? (amount != null ? String(round.currency) : null),
    expected_close_at: expectedCloseAt,
    owner_user_id: ctx.userId,
    source_type: 'MANUAL',
    source_id: null,
    request_key: requestKey,
    creator_type: 'USER',
    created_by_user_id: ctx.userId,
    metadata: {
      founderInvestorCandidateId: candidateId,
      fundraisingRoundId: roundId,
      evidenceClass: 'CRM_CONFIRMED',
    },
    deal_purpose: 'FUNDRAISING',
    fundraising_round_id: roundId,
    ...personContext,
  });
  if (error) throw new Error(`Investor pipeline entry failed: ${error.message}`);
  revalidatePath('/founder');
}

export async function moveFounderInvestorDealStage(form: FormData) {
  const ctx = await ownerContext();
  const dealId = uuid(required(form, 'deal_id'), 'deal_id');
  const stageId = uuid(required(form, 'stage_id'), 'stage_id');
  const version = Number(required(form, 'version'));
  if (!Number.isInteger(version) || version < 1) throw new Error('Invalid deal version');

  const [dealResult, stageResult] = await Promise.all([
    ctx.supabase.from('crm_deals')
      .select('id,pipeline_id,state,amount,currency,expected_close_at,version,deal_purpose')
      .eq('organization_id', ctx.organizationId)
      .eq('id', dealId)
      .maybeSingle(),
    ctx.supabase.from('crm_pipeline_stages')
      .select('id,pipeline_id,category,require_amount,require_expected_close')
      .eq('organization_id', ctx.organizationId)
      .eq('id', stageId)
      .maybeSingle(),
  ]);
  if (dealResult.error) throw new Error(`Investor deal read failed: ${dealResult.error.message}`);
  if (stageResult.error) throw new Error(`Investor stage read failed: ${stageResult.error.message}`);
  const deal = dealResult.data;
  const stage = stageResult.data;
  if (!deal || deal.deal_purpose !== 'FUNDRAISING' || Number(deal.version) !== version) {
    throw new Error('Investor deal version/purpose conflict');
  }
  if (!stage || stage.pipeline_id !== deal.pipeline_id) throw new Error('Investor target stage is outside the fundraising pipeline');

  const submittedAmount = optionalNonNegative(form, 'amount');
  const nextAmount = submittedAmount ?? nonNegativeValue(deal.amount == null ? null : String(deal.amount), 'amount');
  const nextCurrency = nextAmount == null
    ? null
    : currencyValue(optional(form, 'currency') ?? (deal.currency ? String(deal.currency) : null), true);
  const submittedClose = dateOnlyToIso(optional(form, 'expected_close_date'), 'expected_close_date');
  const nextExpectedClose = submittedClose ?? (deal.expected_close_at ? String(deal.expected_close_at) : null);

  if (stage.require_amount && nextAmount == null) throw new Error('Target stage requires amount');
  if (stage.require_expected_close && !nextExpectedClose) throw new Error('Target stage requires expected close date');

  let lostReason: string | null = null;
  let closeEvidence: { sourceType: string; sourceRef: string } | null = null;
  if (stage.category !== 'OPEN') {
    const sourceType = required(form, 'close_source_type').toUpperCase();
    if (!['CUSTOMER_CONFIRMATION','PAYMENT','CONTRACT','OPERATOR_CONFIRMED','OTHER'].includes(sourceType)) {
      throw new Error('Invalid close evidence source type');
    }
    const sourceRef = bounded(required(form, 'close_source_ref'), 'close_source_ref', 512)!;
    closeEvidence = { sourceType, sourceRef };
    if (stage.category === 'LOST') {
      lostReason = bounded(required(form, 'lost_reason'), 'lost_reason', 2000);
    }
  }

  const { data, error } = await ctx.supabase.from('crm_deals')
    .update({
      stage_id: stageId,
      amount: nextAmount,
      currency: nextCurrency,
      expected_close_at: nextExpectedClose,
      lost_reason: lostReason,
      close_evidence: closeEvidence,
    })
    .eq('organization_id', ctx.organizationId)
    .eq('id', dealId)
    .eq('version', version)
    .eq('deal_purpose', 'FUNDRAISING')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Investor deal stage update failed: ${error.message}`);
  if (!data) throw new Error('Investor deal version conflict');
  revalidatePath('/founder');
}
