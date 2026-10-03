import type { FounderStatusSnapshotV1 } from './contracts';
import type { FounderFinanceV1 } from './finance';
import { founderInvestorVerifiedAuthorities, type FounderInvestorWorkspaceV1 } from './investor';
import { founderCapitalVerifiedAuthorities, type FounderCapitalWorkspaceV1 } from './capital';
import { founderStrategyVerifiedAuthorities, type FounderStrategyWorkspaceV1 } from './strategy';

export type FounderInvestorEvidenceState = 'PRESENT' | 'PARTIAL' | 'MISSING';

export type FounderInvestorReadinessItem = {
  key:
    | 'PRODUCT_EVIDENCE'
    | 'SALES_PIPELINE'
    | 'COMMERCIAL_TRAIL'
    | 'OPERATING_CONTROLS'
    | 'COMPANY_FINANCIALS'
    | 'MARKET_RESEARCH'
    | 'FUNDRAISING_STRUCTURE'
    | 'INVESTOR_PIPELINE'
    | 'DUE_DILIGENCE_READINESS';
  title: string;
  state: FounderInvestorEvidenceState;
  detail: string;
  authorities: string[];
};

export type FounderInvestorReadinessV1 = {
  schemaVersion: 1;
  mode: 'READ_ONLY_EVIDENCE';
  generatedAt: string;
  items: FounderInvestorReadinessItem[];
  blockingGaps: string[];
  availableAuthorities: string[];
};

function verifiedAuthorities(status: FounderStatusSnapshotV1) {
  return new Set(
    status.evidence
      .filter((source) => source.quality === 'VERIFIED')
      .map((source) => source.authority),
  );
}

function supported(
  status: FounderStatusSnapshotV1,
  authorities: string[],
) {
  const verified = verifiedAuthorities(status);
  return authorities.every((authority) => verified.has(authority));
}

export function buildFounderInvestorReadinessV1(
  status: FounderStatusSnapshotV1,
  finance?: FounderFinanceV1 | null,
  investor?: FounderInvestorWorkspaceV1 | null,
  capital?: FounderCapitalWorkspaceV1 | null,
  strategy?: FounderStrategyWorkspaceV1 | null,
): FounderInvestorReadinessV1 {
  const items: FounderInvestorReadinessItem[] = [];

  const productSignals =
    status.product.enabledIntegrations +
    status.product.aiRegisteredActions +
    status.product.activeKnowledgeVersions;
  items.push({
    key: 'PRODUCT_EVIDENCE',
    title: 'Product and operating product evidence',
    state: supported(status, ['INTEGRATION_CONNECTIONS', 'TOOL_ACTION_REGISTRY', 'AI_KNOWLEDGE_MEMORY'])
      && productSignals > 0
      ? 'PRESENT'
      : 'MISSING',
    detail: productSignals > 0
      ? 'Canonical integration, governed AI action and Knowledge/Memory evidence exists. This is product evidence, not market traction by itself.'
      : 'No bounded product evidence is present in the current Founder snapshot.',
    authorities: ['INTEGRATION_CONNECTIONS', 'TOOL_ACTION_REGISTRY', 'AI_KNOWLEDGE_MEMORY'],
  });

  const pipelineSignals =
    status.sales.leads + status.sales.qualifiedLeads + status.sales.conversations;
  items.push({
    key: 'SALES_PIPELINE',
    title: 'Sales pipeline evidence',
    state: supported(status, ['CRM_PIPELINE']) && pipelineSignals > 0
      ? status.sales.wonLeads > 0 ? 'PRESENT' : 'PARTIAL'
      : 'MISSING',
    detail: pipelineSignals > 0
      ? status.sales.wonLeads > 0
        ? 'Canonical Lead/Conversation evidence includes observed WON records.'
        : 'Canonical pipeline activity exists, but the current snapshot has no observed WON Lead evidence.'
      : 'No canonical pipeline activity is present in the current snapshot.',
    authorities: ['CRM_PIPELINE'],
  });

  const commercialSignals =
    status.sales.quotes +
    status.sales.orders +
    status.sales.invoices +
    status.sales.paymentTransactions;
  const settlementSignals = status.sales.invoices + status.sales.paymentTransactions;
  items.push({
    key: 'COMMERCIAL_TRAIL',
    title: 'Commercial transaction trail',
    state: supported(status, ['COMMERCE']) && commercialSignals > 0
      ? settlementSignals > 0 ? 'PRESENT' : 'PARTIAL'
      : 'MISSING',
    detail: commercialSignals > 0
      ? settlementSignals > 0
        ? 'Canonical commerce records include Invoice and/or Payment transaction evidence. Counts do not equal recognized revenue without amount/status evidence.'
        : 'Quote/Order evidence exists, but Invoice/Payment transaction evidence is not present in this bounded snapshot.'
      : 'No Quote/Order/Invoice/Payment transaction evidence is present in the current snapshot.',
    authorities: ['COMMERCE'],
  });

  items.push({
    key: 'OPERATING_CONTROLS',
    title: 'Operating controls and AI cost discipline',
    state: supported(status, ['SYSTEM_CONTROLS', 'COST_GUARD'])
      ? status.operatingMode === 'UNKNOWN' ? 'MISSING' : 'PRESENT'
      : 'MISSING',
    detail: supported(status, ['SYSTEM_CONTROLS', 'COST_GUARD'])
      ? 'Canonical runtime controls and Cost Guard evidence are available. Provider/AI spend is not a full company P&L or burn-rate authority.'
      : 'Canonical runtime or Cost Guard evidence is missing.',
    authorities: ['SYSTEM_CONTROLS', 'COST_GUARD'],
  });

  items.push(
    {
      key: 'COMPANY_FINANCIALS',
      title: 'Company financial model, burn and runway',
      state: finance?.companySnapshot ? 'PRESENT' : 'MISSING',
      detail: finance?.companySnapshot
        ? `OWNER-confirmed company snapshot exists as of ${finance.companySnapshot.asOfDate}; runway is derived only from its confirmed cash balance and monthly net burn.`
        : 'No OWNER-confirmed company cash/burn snapshot exists. Provider Cost Guard is not relabeled as company burn.',
      authorities: finance?.companySnapshot ? ['COMPANY_FINANCE'] : [],
    },
    {
      key: 'MARKET_RESEARCH',
      title: 'External market, TAM/SAM/SOM and competitor evidence',
      state: (strategy?.marketResearch.filter((item) => item.status === 'CURRENT').length ?? 0) === 0
        ? 'MISSING'
        : strategy?.marketResearch.some((item) => item.status === 'CURRENT' && item.researchType === 'MARKET_SIZE')
          && strategy?.marketResearch.some((item) => item.status === 'CURRENT' && ['COMPETITOR','PRICING'].includes(item.researchType))
          ? 'PRESENT'
          : 'PARTIAL',
      detail: (strategy?.marketResearch.filter((item) => item.status === 'CURRENT').length ?? 0) === 0
        ? 'No persistent governed sourced market-research evidence is recorded.'
        : 'Persistent sourced external research exists. PRESENT requires current MARKET_SIZE plus COMPETITOR or PRICING evidence; this is evidence coverage, not a market attractiveness score.',
      authorities: strategy ? ['MARKET_RESEARCH'] : [],
    },
    {
      key: 'FUNDRAISING_STRUCTURE',
      title: 'Fundraising structure, cap table and proposed terms',
      state: (investor?.rounds.length ?? 0) > 0
        && (capital?.capTable.totalFullyDilutedUnits ?? 0) > 0
        && (
          (capital?.dilutionScenarios.some(({ scenario }) => scenario.status === 'ACTIVE') ?? false)
          || (capital?.termSheets.length ?? 0) > 0
        )
        ? 'PRESENT'
        : (investor?.rounds.length ?? 0) > 0 || (capital?.capTable.totalFullyDilutedUnits ?? 0) > 0
          ? 'PARTIAL'
          : 'MISSING',
      detail: (capital?.capTable.totalFullyDilutedUnits ?? 0) > 0
        ? (
          (capital?.dilutionScenarios.some(({ scenario }) => scenario.status === 'ACTIVE') ?? false)
          || (capital?.termSheets.length ?? 0) > 0
        )
          ? 'Governed fundraising round, cap-table evidence and financing terms/scenario evidence are present. Valuation and dilution scenario values remain assumptions unless separately confirmed.'
          : 'Governed cap-table evidence exists, but no active dilution scenario or recorded term-sheet evidence is present.'
        : (investor?.rounds.length ?? 0) > 0
          ? 'Governed fundraising round assumptions exist, but current cap-table evidence is still missing.'
          : 'No governed fundraising round or cap-table evidence is present.',
      authorities: [
        ...(investor ? ['FUNDRAISING_STRUCTURE'] : []),
        ...(capital ? ['CAP_TABLE','DILUTION_SCENARIOS','TERM_SHEETS'] : []),
      ],
    },
    {
      key: 'INVESTOR_PIPELINE',
      title: 'Investor pipeline and outreach evidence',
      state: (investor?.pipeline.deals.length ?? 0) > 0
        ? 'PRESENT'
        : (investor?.candidates.length ?? 0) > 0 || Boolean(investor?.pipeline.id)
          ? 'PARTIAL'
          : 'MISSING',
      detail: (investor?.pipeline.deals.length ?? 0) > 0
        ? 'Canonical FUNDRAISING CRM Deal records exist. Their stages are workflow evidence, not a probability of raising capital or proof of investor commitment.'
        : (investor?.candidates.length ?? 0) > 0
          ? 'Investor research evidence exists, but no canonical fundraising Deal is recorded. DISCOVERED_EXTERNAL candidates are not investor interest facts.'
          : investor?.pipeline.id
            ? 'Canonical fundraising pipeline exists, but it contains no investor Deal records.'
            : 'No governed investor research or canonical fundraising pipeline evidence is present.',
      authorities: investor ? ['INVESTOR_RESEARCH', 'INVESTOR_PIPELINE'] : [],
    },
    {
      key: 'DUE_DILIGENCE_READINESS',
      title: 'Data room and due-diligence readiness',
      state: (capital?.diligenceCoverage.total ?? 0) === 0
        ? 'MISSING'
        : capital?.diligenceCoverage.coverageBps === 10000
          ? 'PRESENT'
          : 'PARTIAL',
      detail: (capital?.diligenceCoverage.total ?? 0) === 0
        ? 'No governed due-diligence checklist exists.'
        : capital?.diligenceCoverage.coverageBps === 10000
          ? 'All current governed diligence checklist items are READY, SHARED or explicitly NOT_APPLICABLE.'
          : `${capital?.diligenceCoverage.outstanding.length ?? 0} current diligence item(s) remain MISSING or REQUESTED. Coverage is checklist evidence, not investor approval.`,
      authorities: capital ? ['DUE_DILIGENCE'] : [],
    },
  );

  const blockingGaps = items
    .filter((item) => item.state === 'MISSING')
    .map((item) => item.title);

  const allowedAuthorities = new Set([
    ...verifiedAuthorities(status),
    ...(finance?.evidence
      .filter((item) => item.quality === 'VERIFIED')
      .map((item) => item.authority) ?? []),
    ...founderInvestorVerifiedAuthorities(investor),
    ...founderCapitalVerifiedAuthorities(capital),
    ...founderStrategyVerifiedAuthorities(strategy),
  ]);
  const availableAuthorities = [...new Set(
    items.flatMap((item) => item.authorities)
      .filter((authority) => allowedAuthorities.has(authority)),
  )];

  return {
    schemaVersion: 1,
    mode: 'READ_ONLY_EVIDENCE',
    generatedAt: status.generatedAt,
    items,
    blockingGaps,
    availableAuthorities,
  };
}
