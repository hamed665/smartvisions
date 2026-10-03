import type { FounderStatusSnapshotV1 } from './contracts';
import type { FounderFinanceV1 } from './finance';

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
    | 'INVESTOR_PIPELINE';
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
      state: 'MISSING',
      detail: 'Live web research can answer current questions per request, but no persistent governed market-research evidence set is stored for investor diligence. Model memory and transient web results are not promoted into this deterministic readiness pillar.',
      authorities: [],
    },
    {
      key: 'FUNDRAISING_STRUCTURE',
      title: 'Fundraising structure, cap table and proposed terms',
      state: 'MISSING',
      detail: 'No canonical cap table, fundraising round, target raise, valuation or dilution authority is connected to Founder OS V1.',
      authorities: [],
    },
    {
      key: 'INVESTOR_PIPELINE',
      title: 'Investor pipeline and outreach evidence',
      state: 'MISSING',
      detail: 'No canonical investor CRM or governed investor research source is connected. Founder OS will not invent investor interest or contact status.',
      authorities: [],
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
