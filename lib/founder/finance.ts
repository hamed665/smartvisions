import type { FounderEvidenceQuality } from './contracts';

export type FounderCurrencyAmount = {
  currency: string;
  amount: number;
};

export type FounderFinanceEvidenceClass =
  | 'VERIFIED_PRODUCTION'
  | 'USER_PROVIDED'
  | 'DERIVED'
  | 'ASSUMPTION'
  | 'SCENARIO'
  | 'MISSING';

export type FounderFinanceCustomerProjection = {
  customerCount: number;
  monthlyRevenue: number;
  annualRevenueRunRate: number;
  monthlyGrossProfit: number;
};

export type FounderFinanceForecastPoint = {
  month: number;
  activeCustomers: number;
  monthlyRevenue: number;
  monthlyGrossProfit: number;
};

export type FounderMissingFinancialEvidence = {
  metric:
    | 'RECOGNIZED_REVENUE'
    | 'OBSERVED_CAC'
    | 'OBSERVED_GROSS_MARGIN'
    | 'FULL_COMPANY_LIABILITIES';
  evidenceClass: 'MISSING';
  detail: string;
};

export type CompanyFinancialSnapshotV1 = {
  id: string;
  asOfDate: string;
  currency: string;
  cashBalance: number;
  monthlyNetBurn: number;
  monthlyPayroll: number;
  monthlySalesMarketingSpend: number;
  monthlyOtherOpex: number;
  accountsReceivable: number;
  accountsPayable: number;
  sourceType: 'MANUAL_CONFIRMED' | 'IMPORT_VERIFIED';
  sourceRef: string;
  createdAt: string;
};

export type FounderFinanceScenarioV1 = {
  id: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
  currency: string;
  cashBalanceAssumption: number;
  monthlyNetBurnAssumption: number;
  monthlySalesMarketingSpendAssumption: number;
  startingCustomerCountAssumption: number;
  newCustomersPerMonthAssumption: number;
  targetCustomerCountAssumption: number;
  monthlyArpaAssumption: number;
  grossMarginBpsAssumption: number;
  monthlyChurnBpsAssumption: number;
  notes?: string;
  version: number;
  updatedAt: string;
};

export type FounderFinanceScenarioMetrics = {
  runwayMonths: number | null;
  cac: number | null;
  grossProfitPerCustomerMonthly: number;
  ltv: number | null;
  ltvCacRatio: number | null;
  paybackMonths: number | null;
  incrementalCustomersToOffsetNetBurn: number | null;
};

export type FounderFinanceEvidence = {
  authority:
    | 'COMPANY_FINANCE'
    | 'SUBSCRIPTION_BILLING'
    | 'PAYMENT_LEDGER'
    | 'INVOICE_LEDGER'
    | 'CRM_DEALS';
  quality: FounderEvidenceQuality;
  evidenceClass: FounderFinanceEvidenceClass;
  count?: number;
  detail: string;
};

export type FounderFinanceV1 = {
  schemaVersion: 1;
  generatedAt: string;
  companySnapshot: CompanyFinancialSnapshotV1 | null;
  companyRunwayMonths: number | null;
  derived: {
    evidenceClass: 'DERIVED';
    subscriptionMrr: FounderCurrencyAmount[];
    subscriptionArr: FounderCurrencyAmount[];
    netCaptured30d: FounderCurrencyAmount[];
    outstandingInvoices: FounderCurrencyAmount[];
    averageWonDealValue: FounderCurrencyAmount[];
  };
  scenarios: Array<{
    scenario: FounderFinanceScenarioV1;
    metrics: FounderFinanceScenarioMetrics;
    customerCountProjections: FounderFinanceCustomerProjection[];
    revenueForecast: FounderFinanceForecastPoint[];
  }>;
  missingEvidence: FounderMissingFinancialEvidence[];
  evidence: FounderFinanceEvidence[];
};

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function rounded(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

export function calculateFounderFinanceScenario(
  scenario: FounderFinanceScenarioV1,
): FounderFinanceScenarioMetrics {
  const cash = finite(scenario.cashBalanceAssumption);
  const netBurn = finite(scenario.monthlyNetBurnAssumption);
  const marketing = finite(scenario.monthlySalesMarketingSpendAssumption);
  const newCustomers = finite(scenario.newCustomersPerMonthAssumption);
  const arpa = finite(scenario.monthlyArpaAssumption);
  const grossMargin = Math.min(1, finite(scenario.grossMarginBpsAssumption) / 10_000);
  const monthlyChurn = Math.min(1, finite(scenario.monthlyChurnBpsAssumption) / 10_000);

  const cac = newCustomers > 0 ? marketing / newCustomers : null;
  const grossProfitPerCustomerMonthly = arpa * grossMargin;
  const ltv = monthlyChurn > 0 && grossProfitPerCustomerMonthly > 0
    ? grossProfitPerCustomerMonthly / monthlyChurn
    : null;
  const ltvCacRatio = ltv != null && cac != null && cac > 0 ? ltv / cac : null;
  const paybackMonths = cac != null && grossProfitPerCustomerMonthly > 0
    ? cac / grossProfitPerCustomerMonthly
    : null;
  const incrementalCustomersToOffsetNetBurn = grossProfitPerCustomerMonthly > 0 && netBurn > 0
    ? netBurn / grossProfitPerCustomerMonthly
    : null;

  return {
    runwayMonths: rounded(netBurn > 0 ? cash / netBurn : null),
    cac: rounded(cac),
    grossProfitPerCustomerMonthly: rounded(grossProfitPerCustomerMonthly) ?? 0,
    ltv: rounded(ltv),
    ltvCacRatio: rounded(ltvCacRatio),
    paybackMonths: rounded(paybackMonths),
    incrementalCustomersToOffsetNetBurn: rounded(incrementalCustomersToOffsetNetBurn),
  };
}

export function calculateFounderCustomerCountProjections(
  scenario: FounderFinanceScenarioV1,
): FounderFinanceCustomerProjection[] {
  const arpa = finite(scenario.monthlyArpaAssumption);
  const grossMargin = Math.min(1, finite(scenario.grossMarginBpsAssumption) / 10_000);
  const custom = finite(scenario.targetCustomerCountAssumption);
  const counts = [...new Set([10, 25, 50, 100, custom].filter((value) => value > 0))]
    .sort((a, b) => a - b);

  return counts.map((customerCount) => {
    const monthlyRevenue = customerCount * arpa;
    return {
      customerCount,
      monthlyRevenue: rounded(monthlyRevenue) ?? 0,
      annualRevenueRunRate: rounded(monthlyRevenue * 12) ?? 0,
      monthlyGrossProfit: rounded(monthlyRevenue * grossMargin) ?? 0,
    };
  });
}

export function calculateFounderRevenueForecast(
  scenario: FounderFinanceScenarioV1,
  months = 12,
): FounderFinanceForecastPoint[] {
  const periodCount = Math.min(36, Math.max(1, Math.trunc(months)));
  const arpa = finite(scenario.monthlyArpaAssumption);
  const grossMargin = Math.min(1, finite(scenario.grossMarginBpsAssumption) / 10_000);
  const monthlyChurn = Math.min(1, finite(scenario.monthlyChurnBpsAssumption) / 10_000);
  const newCustomers = finite(scenario.newCustomersPerMonthAssumption);
  let activeCustomers = finite(scenario.startingCustomerCountAssumption);

  return Array.from({ length: periodCount }, (_, index) => {
    activeCustomers = Math.max(0, activeCustomers * (1 - monthlyChurn) + newCustomers);
    const monthlyRevenue = activeCustomers * arpa;
    return {
      month: index + 1,
      activeCustomers: rounded(activeCustomers) ?? 0,
      monthlyRevenue: rounded(monthlyRevenue) ?? 0,
      monthlyGrossProfit: rounded(monthlyRevenue * grossMargin) ?? 0,
    };
  });
}

export function founderFinanceModelPayload(finance: FounderFinanceV1 | null | undefined) {
  if (!finance) return null;
  return {
    schemaVersion: finance.schemaVersion,
    generatedAt: finance.generatedAt,
    companySnapshot: finance.companySnapshot,
    companyRunwayMonths: finance.companyRunwayMonths,
    derived: finance.derived,
    scenarios: finance.scenarios.map(({ scenario, metrics, customerCountProjections, revenueForecast }) => ({
      name: scenario.name,
      status: scenario.status,
      currency: scenario.currency,
      assumptions: {
        cashBalance: scenario.cashBalanceAssumption,
        monthlyNetBurn: scenario.monthlyNetBurnAssumption,
        monthlySalesMarketingSpend: scenario.monthlySalesMarketingSpendAssumption,
        startingCustomerCount: scenario.startingCustomerCountAssumption,
        newCustomersPerMonth: scenario.newCustomersPerMonthAssumption,
        targetCustomerCount: scenario.targetCustomerCountAssumption,
        monthlyArpa: scenario.monthlyArpaAssumption,
        grossMarginBps: scenario.grossMarginBpsAssumption,
        monthlyChurnBps: scenario.monthlyChurnBpsAssumption,
      },
      derivedScenarioMetrics: metrics,
      customerCountProjections,
      revenueForecast: {
        evidenceClass: 'SCENARIO' as const,
        points: revenueForecast,
      },
    })),
    missingEvidence: finance.missingEvidence,
    evidence: finance.evidence,
  };
}

export function founderFinanceVerifiedAuthorities(finance: FounderFinanceV1 | null | undefined) {
  return finance
    ? finance.evidence
        .filter((item) => item.quality === 'VERIFIED')
        .map((item) => item.authority)
    : [];
}
