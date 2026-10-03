import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildFounderDiligenceCoverage,
  calculateFounderCapTable,
  calculateFounderDilutionScenario,
  compareFounderTermSheets,
  type FounderCapitalWorkspaceV1,
  type FounderCapTableRecordV1,
  type FounderDilutionScenarioRecordV1,
  type FounderDueDiligenceRecordV1,
  type FounderTermSheetRecordV1,
} from './capital';

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function nullableNumber(value: unknown) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function optionalString(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

export async function loadFounderCapitalWorkspaceV1(input: {
  supabase: SupabaseClient;
  organizationId: string;
  now?: Date;
}): Promise<FounderCapitalWorkspaceV1> {
  const db = input.supabase;
  const org = input.organizationId;
  const now = input.now ?? new Date();

  const [capResult, dilutionResult, termResult, diligenceResult] = await Promise.all([
    db.from('founder_cap_table_entries')
      .select('id,status,holder_type,holder_name,person_id,business_id,security_type,share_class,issued_units,reserved_units,source_type,source_ref,notes,version,updated_at')
      .eq('organization_id', org)
      .order('updated_at', { ascending: false })
      .limit(500),
    db.from('founder_dilution_scenarios')
      .select('id,fundraising_round_id,name,status,currency,pre_money_valuation_assumption,new_money_amount_assumption,option_pool_top_up_units_assumption,assumption_source_ref,notes,version,updated_at')
      .eq('organization_id', org)
      .order('updated_at', { ascending: false })
      .limit(100),
    db.from('founder_term_sheets')
      .select('id,fundraising_round_id,investor_candidate_id,crm_deal_id,counterparty_name,label,status,instrument,currency,investment_amount,pre_money_valuation,valuation_cap,discount_bps,interest_rate_bps,maturity_months,liquidation_preference_multiple,participating_preferred,board_seat_rights,pro_rata_rights,information_rights,exclusivity_days,source_type,source_ref,notes,version,updated_at')
      .eq('organization_id', org)
      .order('updated_at', { ascending: false })
      .limit(100),
    db.from('founder_due_diligence_items')
      .select('id,fundraising_round_id,category,title,status,sensitivity,evidence_ref,last_verified_at,notes,version,updated_at')
      .eq('organization_id', org)
      .order('category', { ascending: true })
      .order('updated_at', { ascending: false })
      .limit(300),
  ]);

  const firstError = [capResult.error, dilutionResult.error, termResult.error, diligenceResult.error].find(Boolean);
  if (firstError) throw new Error(`Founder Capital workspace read failed: ${firstError.message}`);

  const capEntries: FounderCapTableRecordV1[] = (capResult.data ?? []).map((row) => ({
    id: String(row.id),
    status: row.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    holderType: row.holder_type === 'EMPLOYEE'
      ? 'EMPLOYEE'
      : row.holder_type === 'INVESTOR'
        ? 'INVESTOR'
        : row.holder_type === 'OPTION_POOL'
          ? 'OPTION_POOL'
          : row.holder_type === 'OTHER'
            ? 'OTHER'
            : 'FOUNDER',
    holderName: String(row.holder_name ?? ''),
    personId: optionalString(row.person_id),
    businessId: optionalString(row.business_id),
    securityType: row.security_type === 'PREFERRED'
      ? 'PREFERRED'
      : row.security_type === 'OPTION_POOL'
        ? 'OPTION_POOL'
        : row.security_type === 'OTHER'
          ? 'OTHER'
          : 'COMMON',
    shareClass: optionalString(row.share_class),
    issuedUnits: number(row.issued_units),
    reservedUnits: number(row.reserved_units),
    sourceType: row.source_type === 'IMPORT_VERIFIED' ? 'IMPORT_VERIFIED' : 'MANUAL_CONFIRMED',
    sourceRef: String(row.source_ref ?? ''),
    notes: optionalString(row.notes),
    version: Number(row.version ?? 1),
    updatedAt: String(row.updated_at ?? now.toISOString()),
  }));

  const dilutionScenarios: FounderDilutionScenarioRecordV1[] = (dilutionResult.data ?? []).map((row) => ({
    id: String(row.id),
    fundraisingRoundId: String(row.fundraising_round_id),
    name: String(row.name ?? ''),
    status: row.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
    currency: String(row.currency ?? ''),
    preMoneyValuationAssumption: number(row.pre_money_valuation_assumption),
    newMoneyAmountAssumption: number(row.new_money_amount_assumption),
    optionPoolTopUpUnitsAssumption: number(row.option_pool_top_up_units_assumption),
    assumptionSourceRef: String(row.assumption_source_ref ?? ''),
    notes: optionalString(row.notes),
    version: Number(row.version ?? 1),
    updatedAt: String(row.updated_at ?? now.toISOString()),
  }));

  const termSheets: FounderTermSheetRecordV1[] = (termResult.data ?? []).map((row) => ({
    id: String(row.id),
    fundraisingRoundId: String(row.fundraising_round_id),
    investorCandidateId: optionalString(row.investor_candidate_id),
    crmDealId: optionalString(row.crm_deal_id),
    counterpartyName: String(row.counterparty_name ?? ''),
    label: String(row.label ?? ''),
    status: row.status === 'DRAFT'
      ? 'DRAFT'
      : row.status === 'COUNTERED'
        ? 'COUNTERED'
        : row.status === 'ACCEPTED'
          ? 'ACCEPTED'
          : row.status === 'DECLINED'
            ? 'DECLINED'
            : row.status === 'WITHDRAWN'
              ? 'WITHDRAWN'
              : 'RECEIVED',
    instrument: row.instrument === 'SAFE'
      ? 'SAFE'
      : row.instrument === 'CONVERTIBLE_NOTE'
        ? 'CONVERTIBLE_NOTE'
        : row.instrument === 'OTHER'
          ? 'OTHER'
          : 'EQUITY',
    currency: String(row.currency ?? ''),
    investmentAmount: number(row.investment_amount),
    preMoneyValuation: nullableNumber(row.pre_money_valuation),
    valuationCap: nullableNumber(row.valuation_cap),
    discountBps: nullableNumber(row.discount_bps),
    interestRateBps: nullableNumber(row.interest_rate_bps),
    maturityMonths: nullableNumber(row.maturity_months),
    liquidationPreferenceMultiple: nullableNumber(row.liquidation_preference_multiple),
    participatingPreferred: typeof row.participating_preferred === 'boolean' ? row.participating_preferred : null,
    boardSeatRights: typeof row.board_seat_rights === 'boolean' ? row.board_seat_rights : null,
    proRataRights: typeof row.pro_rata_rights === 'boolean' ? row.pro_rata_rights : null,
    informationRights: typeof row.information_rights === 'boolean' ? row.information_rights : null,
    exclusivityDays: nullableNumber(row.exclusivity_days),
    sourceType: row.source_type === 'IMPORT_VERIFIED' ? 'IMPORT_VERIFIED' : 'MANUAL_CONFIRMED',
    sourceRef: String(row.source_ref ?? ''),
    notes: optionalString(row.notes),
    version: Number(row.version ?? 1),
    updatedAt: String(row.updated_at ?? now.toISOString()),
  }));

  const diligenceItems: FounderDueDiligenceRecordV1[] = (diligenceResult.data ?? []).map((row) => ({
    id: String(row.id),
    fundraisingRoundId: optionalString(row.fundraising_round_id),
    category: row.category === 'FINANCE'
      ? 'FINANCE'
      : row.category === 'LEGAL'
        ? 'LEGAL'
        : row.category === 'IP'
          ? 'IP'
          : row.category === 'SECURITY'
            ? 'SECURITY'
            : row.category === 'PRODUCT'
              ? 'PRODUCT'
              : row.category === 'COMMERCIAL'
                ? 'COMMERCIAL'
                : row.category === 'HR'
                  ? 'HR'
                  : row.category === 'TAX'
                    ? 'TAX'
                    : row.category === 'OTHER'
                      ? 'OTHER'
                      : 'CORPORATE',
    title: String(row.title ?? ''),
    status: row.status === 'REQUESTED'
      ? 'REQUESTED'
      : row.status === 'READY'
        ? 'READY'
        : row.status === 'SHARED'
          ? 'SHARED'
          : row.status === 'NOT_APPLICABLE'
            ? 'NOT_APPLICABLE'
            : 'MISSING',
    sensitivity: row.sensitivity === 'INTERNAL'
      ? 'INTERNAL'
      : row.sensitivity === 'RESTRICTED'
        ? 'RESTRICTED'
        : 'CONFIDENTIAL',
    evidenceRef: optionalString(row.evidence_ref),
    lastVerifiedAt: optionalString(row.last_verified_at),
    notes: optionalString(row.notes),
    version: Number(row.version ?? 1),
    updatedAt: String(row.updated_at ?? now.toISOString()),
  }));

  const capTable = calculateFounderCapTable(capEntries);

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    capEntries,
    capTable,
    dilutionScenarios: dilutionScenarios.map((scenario) => ({
      scenario,
      result: calculateFounderDilutionScenario(capEntries, scenario),
    })),
    termSheets,
    termComparison: compareFounderTermSheets(termSheets),
    diligenceItems,
    diligenceCoverage: buildFounderDiligenceCoverage(diligenceItems),
    evidence: [
      {
        authority: 'CAP_TABLE',
        quality: 'VERIFIED',
        evidenceClass: 'VERIFIED_PRODUCTION',
        count: capEntries.filter((entry) => entry.status === 'ACTIVE').length,
        detail: 'Production cap-table authority queried successfully. Ownership percentages are derived only from ACTIVE confirmed units.',
      },
      {
        authority: 'DILUTION_SCENARIOS',
        quality: 'VERIFIED',
        evidenceClass: 'VERIFIED_PRODUCTION',
        count: dilutionScenarios.filter((scenario) => scenario.status === 'ACTIVE').length,
        detail: 'Production dilution-scenario authority queried successfully. Results remain explicit scenarios, not observed ownership.',
      },
      {
        authority: 'TERM_SHEETS',
        quality: 'VERIFIED',
        evidenceClass: 'VERIFIED_PRODUCTION',
        count: termSheets.length,
        detail: 'Production term-sheet evidence queried successfully. A recorded sheet is user/import-provided terms, not proof of funded capital.',
      },
      {
        authority: 'DUE_DILIGENCE',
        quality: 'VERIFIED',
        evidenceClass: 'VERIFIED_PRODUCTION',
        count: diligenceItems.length,
        detail: 'Production due-diligence checklist queried successfully. READY/SHARED records carry explicit evidence references.',
      },
    ],
  };
}
