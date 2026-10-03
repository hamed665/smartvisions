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

function validUuid(value: string | null, key: string) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${key} is invalid`);
  }
  return value;
}

function optionalUuid(value: string | null, key: string) {
  return value ? validUuid(value, key) : null;
}

function numeric(value: string | null, key: string, allowZero = true) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed <= 0)) {
    throw new Error(`${key} must be ${allowZero ? 'non-negative' : 'greater than zero'}`);
  }
  return parsed;
}

function requiredNumber(form: FormData, key: string, allowZero = true) {
  const value = numeric(required(form, key), key, allowZero);
  if (value == null) throw new Error(`${key} is required`);
  return value;
}

function optionalNumber(form: FormData, key: string, allowZero = true) {
  return numeric(optional(form, key), key, allowZero);
}

function optionalInteger(form: FormData, key: string, min: number, max: number) {
  const value = optionalNumber(form, key);
  if (value == null) return null;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function bpsFromPercent(form: FormData, key: string) {
  const value = optionalNumber(form, key);
  if (value == null) return null;
  if (value > 100) throw new Error(`${key} must be between 0 and 100`);
  return Math.round(value * 100);
}

function currency(form: FormData) {
  const value = required(form, 'currency').toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) throw new Error('currency must be a three-letter ISO code');
  return value;
}

function triState(form: FormData, key: string) {
  const value = String(form.get(key) ?? '').trim().toUpperCase();
  if (value === 'YES') return true;
  if (value === 'NO') return false;
  return null;
}

function dateToIso(value: string | null, key: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${key} must be a date`);
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) throw new Error(`${key} is invalid`);
  return date.toISOString();
}

async function ownerContext() {
  const ctx = await getCurrentOrganization(true);
  if (!ctx.userId || ctx.role !== 'OWNER') throw new Error('Owner permission required');
  return ctx;
}

function identity(form: FormData) {
  const idRaw = optional(form, 'id');
  const versionRaw = Number(form.get('version') ?? 0);
  if (!idRaw) return { id: null, version: null };
  const id = validUuid(idRaw, 'id');
  if (!Number.isInteger(versionRaw) || versionRaw < 1) throw new Error('Invalid version');
  return { id, version: versionRaw };
}

export async function saveFounderCapTableEntry(form: FormData) {
  const ctx = await ownerContext();
  const { id, version } = identity(form);
  const holderType = required(form, 'holder_type').toUpperCase();
  const securityType = required(form, 'security_type').toUpperCase();
  if (!['FOUNDER','EMPLOYEE','INVESTOR','OPTION_POOL','OTHER'].includes(holderType)) throw new Error('Invalid holder_type');
  if (!['COMMON','PREFERRED','OPTION_POOL','OTHER'].includes(securityType)) throw new Error('Invalid security_type');

  const issuedUnits = requiredNumber(form, 'issued_units');
  const reservedUnits = requiredNumber(form, 'reserved_units');
  let personId = optionalUuid(optional(form, 'person_id'), 'person_id');
  let businessId = optionalUuid(optional(form, 'business_id'), 'business_id');

  if (holderType === 'OPTION_POOL') {
    if (securityType !== 'OPTION_POOL' || issuedUnits !== 0 || reservedUnits <= 0) {
      throw new Error('Option pool requires OPTION_POOL security, zero issued units and positive reserved units');
    }
    personId = null;
    businessId = null;
  } else if (securityType === 'OPTION_POOL' || issuedUnits <= 0 || reservedUnits !== 0) {
    throw new Error('Non-option-pool holder requires positive issued units and zero reserved units');
  }

  const payload = {
    status: 'ACTIVE',
    holder_type: holderType,
    holder_name: required(form, 'holder_name').slice(0, 240),
    person_id: personId,
    business_id: businessId,
    security_type: securityType,
    share_class: bounded(optional(form, 'share_class'), 'share_class', 80),
    issued_units: issuedUnits,
    reserved_units: reservedUnits,
    source_type: 'MANUAL_CONFIRMED',
    source_ref: bounded(required(form, 'source_ref'), 'source_ref', 512),
    evidence: {
      confirmation: 'OWNER_MANUAL_CONFIRMED',
      recordedAt: new Date().toISOString(),
    },
    notes: bounded(optional(form, 'notes'), 'notes', 4000),
    updated_by_user_id: ctx.userId,
  };

  if (id && version) {
    const { data, error } = await ctx.supabase.from('founder_cap_table_entries')
      .update(payload)
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .eq('version', version)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`Cap table update failed: ${error.message}`);
    if (!data) throw new Error('Cap table version conflict');
  } else {
    const { error } = await ctx.supabase.from('founder_cap_table_entries').insert({
      organization_id: ctx.organizationId,
      ...payload,
      created_by_user_id: ctx.userId,
    });
    if (error) throw new Error(`Cap table create failed: ${error.message}`);
  }
  revalidatePath('/founder');
}

export async function archiveFounderCapTableEntry(form: FormData) {
  const ctx = await ownerContext();
  const { id, version } = identity(form);
  if (!id || !version) throw new Error('Cap table identity required');
  const { data, error } = await ctx.supabase.from('founder_cap_table_entries')
    .update({ status: 'ARCHIVED', updated_by_user_id: ctx.userId })
    .eq('organization_id', ctx.organizationId)
    .eq('id', id)
    .eq('version', version)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Cap table archive failed: ${error.message}`);
  if (!data) throw new Error('Cap table version conflict');
  revalidatePath('/founder');
}

export async function saveFounderDilutionScenario(form: FormData) {
  const ctx = await ownerContext();
  const { id, version } = identity(form);
  const payload = {
    fundraising_round_id: validUuid(required(form, 'fundraising_round_id'), 'fundraising_round_id'),
    name: required(form, 'name').slice(0, 160),
    status: 'ACTIVE',
    currency: currency(form),
    pre_money_valuation_assumption: requiredNumber(form, 'pre_money_valuation_assumption', false),
    new_money_amount_assumption: requiredNumber(form, 'new_money_amount_assumption', false),
    option_pool_top_up_units_assumption: requiredNumber(form, 'option_pool_top_up_units_assumption'),
    assumption_source_ref: bounded(required(form, 'assumption_source_ref'), 'assumption_source_ref', 512),
    assumption_evidence: {
      confirmation: 'OWNER_ASSUMPTION',
      recordedAt: new Date().toISOString(),
    },
    notes: bounded(optional(form, 'notes'), 'notes', 4000),
    updated_by_user_id: ctx.userId,
  };

  if (id && version) {
    const { data, error } = await ctx.supabase.from('founder_dilution_scenarios')
      .update(payload)
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .eq('version', version)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`Dilution scenario update failed: ${error.message}`);
    if (!data) throw new Error('Dilution scenario version conflict');
  } else {
    const { error } = await ctx.supabase.from('founder_dilution_scenarios').insert({
      organization_id: ctx.organizationId,
      ...payload,
      created_by_user_id: ctx.userId,
    });
    if (error) throw new Error(`Dilution scenario create failed: ${error.message}`);
  }
  revalidatePath('/founder');
}

export async function archiveFounderDilutionScenario(form: FormData) {
  const ctx = await ownerContext();
  const { id, version } = identity(form);
  if (!id || !version) throw new Error('Dilution scenario identity required');
  const { data, error } = await ctx.supabase.from('founder_dilution_scenarios')
    .update({ status: 'ARCHIVED', updated_by_user_id: ctx.userId })
    .eq('organization_id', ctx.organizationId)
    .eq('id', id)
    .eq('version', version)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Dilution scenario archive failed: ${error.message}`);
  if (!data) throw new Error('Dilution scenario version conflict');
  revalidatePath('/founder');
}

export async function saveFounderTermSheet(form: FormData) {
  const ctx = await ownerContext();
  const { id, version } = identity(form);
  const status = required(form, 'status').toUpperCase();
  const instrument = required(form, 'instrument').toUpperCase();
  if (!['DRAFT','RECEIVED','COUNTERED','ACCEPTED','DECLINED','WITHDRAWN'].includes(status)) throw new Error('Invalid term-sheet status');
  if (!['EQUITY','SAFE','CONVERTIBLE_NOTE','OTHER'].includes(instrument)) throw new Error('Invalid term-sheet instrument');

  const liquidation = optionalNumber(form, 'liquidation_preference_multiple', false);
  if (liquidation != null && liquidation > 10) throw new Error('liquidation preference must be at most 10x');

  const payload = {
    fundraising_round_id: validUuid(required(form, 'fundraising_round_id'), 'fundraising_round_id'),
    investor_candidate_id: optionalUuid(optional(form, 'investor_candidate_id'), 'investor_candidate_id'),
    crm_deal_id: optionalUuid(optional(form, 'crm_deal_id'), 'crm_deal_id'),
    counterparty_name: required(form, 'counterparty_name').slice(0, 240),
    label: required(form, 'label').slice(0, 160),
    status,
    instrument,
    currency: currency(form),
    investment_amount: requiredNumber(form, 'investment_amount', false),
    pre_money_valuation: optionalNumber(form, 'pre_money_valuation', false),
    valuation_cap: optionalNumber(form, 'valuation_cap', false),
    discount_bps: bpsFromPercent(form, 'discount_pct'),
    interest_rate_bps: bpsFromPercent(form, 'interest_rate_pct'),
    maturity_months: optionalInteger(form, 'maturity_months', 1, 120),
    liquidation_preference_multiple: liquidation,
    participating_preferred: triState(form, 'participating_preferred'),
    board_seat_rights: triState(form, 'board_seat_rights'),
    pro_rata_rights: triState(form, 'pro_rata_rights'),
    information_rights: triState(form, 'information_rights'),
    exclusivity_days: optionalInteger(form, 'exclusivity_days', 0, 365),
    source_type: 'MANUAL_CONFIRMED',
    source_ref: bounded(required(form, 'source_ref'), 'source_ref', 512),
    evidence: {
      confirmation: 'OWNER_MANUAL_CONFIRMED',
      recordedAt: new Date().toISOString(),
    },
    notes: bounded(optional(form, 'notes'), 'notes', 6000),
    updated_by_user_id: ctx.userId,
  };

  if (id && version) {
    const { data, error } = await ctx.supabase.from('founder_term_sheets')
      .update(payload)
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .eq('version', version)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`Term sheet update failed: ${error.message}`);
    if (!data) throw new Error('Term sheet version conflict');
  } else {
    const { error } = await ctx.supabase.from('founder_term_sheets').insert({
      organization_id: ctx.organizationId,
      ...payload,
      created_by_user_id: ctx.userId,
    });
    if (error) throw new Error(`Term sheet create failed: ${error.message}`);
  }
  revalidatePath('/founder');
}

export async function saveFounderDueDiligenceItem(form: FormData) {
  const ctx = await ownerContext();
  const { id, version } = identity(form);
  const category = required(form, 'category').toUpperCase();
  const status = required(form, 'status').toUpperCase();
  const sensitivity = required(form, 'sensitivity').toUpperCase();
  if (!['CORPORATE','FINANCE','LEGAL','IP','SECURITY','PRODUCT','COMMERCIAL','HR','TAX','OTHER'].includes(category)) throw new Error('Invalid diligence category');
  if (!['MISSING','REQUESTED','READY','SHARED','NOT_APPLICABLE'].includes(status)) throw new Error('Invalid diligence status');
  if (!['INTERNAL','CONFIDENTIAL','RESTRICTED'].includes(sensitivity)) throw new Error('Invalid sensitivity');

  const evidenceRef = bounded(optional(form, 'evidence_ref'), 'evidence_ref', 1024);
  const verifiedAt = dateToIso(optional(form, 'last_verified_date'), 'last_verified_date');
  if (['READY','SHARED'].includes(status) && (!evidenceRef || !verifiedAt)) {
    throw new Error('READY/SHARED diligence requires evidence_ref and last_verified_date');
  }

  const payload = {
    fundraising_round_id: optionalUuid(optional(form, 'fundraising_round_id'), 'fundraising_round_id'),
    category,
    title: required(form, 'title').slice(0, 240),
    status,
    sensitivity,
    evidence_ref: evidenceRef,
    last_verified_at: verifiedAt,
    notes: bounded(optional(form, 'notes'), 'notes', 4000),
    updated_by_user_id: ctx.userId,
  };

  if (id && version) {
    const { data, error } = await ctx.supabase.from('founder_due_diligence_items')
      .update(payload)
      .eq('organization_id', ctx.organizationId)
      .eq('id', id)
      .eq('version', version)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`Due diligence update failed: ${error.message}`);
    if (!data) throw new Error('Due diligence version conflict');
  } else {
    const { error } = await ctx.supabase.from('founder_due_diligence_items').insert({
      organization_id: ctx.organizationId,
      ...payload,
      created_by_user_id: ctx.userId,
    });
    if (error) throw new Error(`Due diligence create failed: ${error.message}`);
  }
  revalidatePath('/founder');
}
