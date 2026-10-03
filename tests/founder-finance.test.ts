import { describe, expect, it } from 'vitest';

import {
  calculateFounderCustomerCountProjections,
  calculateFounderFinanceScenario,
  founderFinanceModelPayload,
  founderFinanceVerifiedAuthorities,
  type FounderFinanceScenarioV1,
  type FounderFinanceV1,
} from '@/lib/founder/finance';

const scenario: FounderFinanceScenarioV1 = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Base',
  status: 'ACTIVE',
  currency: 'OMR',
  cashBalanceAssumption: 12000,
  monthlyNetBurnAssumption: 2000,
  monthlySalesMarketingSpendAssumption: 1000,
  newCustomersPerMonthAssumption: 5,
  targetCustomerCountAssumption: 75,
  monthlyArpaAssumption: 300,
  grossMarginBpsAssumption: 8000,
  monthlyChurnBpsAssumption: 500,
  version: 1,
  updatedAt: '2026-10-03T12:00:00.000Z',
};

describe('Founder finance V1', () => {
  it('calculates scenario unit economics deterministically and labels no facts by itself', () => {
    expect(calculateFounderFinanceScenario(scenario)).toEqual({
      runwayMonths: 6,
      cac: 200,
      grossProfitPerCustomerMonthly: 240,
      ltv: 4800,
      ltvCacRatio: 24,
      paybackMonths: 0.83,
      incrementalCustomersToOffsetNetBurn: 8.33,
    });
  });

  it('builds deterministic 10/25/50/100 plus custom customer-count revenue scenarios', () => {
    expect(calculateFounderCustomerCountProjections(scenario)).toEqual([
      { customerCount: 10, monthlyRevenue: 3000, annualRevenueRunRate: 36000, monthlyGrossProfit: 2400 },
      { customerCount: 25, monthlyRevenue: 7500, annualRevenueRunRate: 90000, monthlyGrossProfit: 6000 },
      { customerCount: 50, monthlyRevenue: 15000, annualRevenueRunRate: 180000, monthlyGrossProfit: 12000 },
      { customerCount: 75, monthlyRevenue: 22500, annualRevenueRunRate: 270000, monthlyGrossProfit: 18000 },
      { customerCount: 100, monthlyRevenue: 30000, annualRevenueRunRate: 360000, monthlyGrossProfit: 24000 },
    ]);
  });

  it('fails undefined denominators closed instead of manufacturing CAC/LTV/runway', () => {
    const metrics = calculateFounderFinanceScenario({
      ...scenario,
      monthlyNetBurnAssumption: 0,
      newCustomersPerMonthAssumption: 0,
      monthlyChurnBpsAssumption: 0,
    });
    expect(metrics.runwayMonths).toBeNull();
    expect(metrics.cac).toBeNull();
    expect(metrics.ltv).toBeNull();
    expect(metrics.ltvCacRatio).toBeNull();
  });

  it('exposes only verified finance authorities and keeps scenarios explicitly under assumptions', () => {
    const finance: FounderFinanceV1 = {
      schemaVersion: 1,
      generatedAt: '2026-10-03T12:00:00.000Z',
      companySnapshot: null,
      companyRunwayMonths: null,
      derived: {
        evidenceClass: 'DERIVED',
        subscriptionMrr: [{ currency: 'OMR', amount: 500 }],
        subscriptionArr: [{ currency: 'OMR', amount: 6000 }],
        netCaptured30d: [],
        outstandingInvoices: [],
        averageWonDealValue: [],
      },
      scenarios: [{
        scenario,
        metrics: calculateFounderFinanceScenario(scenario),
        customerCountProjections: calculateFounderCustomerCountProjections(scenario),
      }],
      missingEvidence: [{
        metric: 'RECOGNIZED_REVENUE',
        evidenceClass: 'MISSING',
        detail: 'no recognition authority',
      }],
      evidence: [
        { authority: 'COMPANY_FINANCE', quality: 'MISSING', evidenceClass: 'MISSING', detail: 'missing' },
        { authority: 'SUBSCRIPTION_BILLING', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 2, detail: 'observed' },
        { authority: 'PAYMENT_LEDGER', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 0, detail: 'observed' },
        { authority: 'INVOICE_LEDGER', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 0, detail: 'observed' },
        { authority: 'CRM_DEALS', quality: 'VERIFIED', evidenceClass: 'VERIFIED_PRODUCTION', count: 0, detail: 'observed' },
      ],
    };
    expect(founderFinanceVerifiedAuthorities(finance)).toEqual([
      'SUBSCRIPTION_BILLING',
      'PAYMENT_LEDGER',
      'INVOICE_LEDGER',
      'CRM_DEALS',
    ]);
    const payload = founderFinanceModelPayload(finance)!;
    expect(payload.scenarios[0]?.assumptions.monthlyArpa).toBe(300);
    expect(payload.scenarios[0]?.assumptions.targetCustomerCount).toBe(75);
    expect(payload.scenarios[0]?.customerCountProjections).toHaveLength(5);
    expect(payload.scenarios[0]?.derivedScenarioMetrics.ltv).toBe(4800);
    expect(payload.missingEvidence[0]?.metric).toBe('RECOGNIZED_REVENUE');
    expect(payload.companySnapshot).toBeNull();
  });
});
