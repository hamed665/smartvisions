import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  calculateFounderFinanceScenario,
  type CompanyFinancialSnapshotV1,
  type FounderCurrencyAmount,
  type FounderFinanceScenarioV1,
  type FounderFinanceV1,
} from './finance';

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function aggregateCurrency(rows: Array<{ currency?: unknown; amount?: unknown }>) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = String(row.currency ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) continue;
    totals.set(currency, (totals.get(currency) ?? 0) + number(row.amount));
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]): FounderCurrencyAmount => ({
      currency,
      amount: Number(amount.toFixed(2)),
    }));
}

export async function loadFounderFinanceV1(input: {
  supabase: SupabaseClient;
  organizationId: string;
  now?: Date;
}): Promise<FounderFinanceV1> {
  const db = input.supabase;
  const org = input.organizationId;
  const now = input.now ?? new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [snapshotResult, scenariosResult, subscriptionsResult, paymentsResult, invoicesResult] =
    await Promise.all([
      db.from('company_financial_snapshots')
        .select('*')
        .eq('organization_id', org)
        .order('as_of_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from('founder_finance_scenarios')
        .select('*')
        .eq('organization_id', org)
        .eq('status', 'ACTIVE')
        .order('updated_at', { ascending: false })
        .limit(10),
      db.from('subscriptions')
        .select('id,pricing_version_id,status')
        .eq('organization_id', org)
        .in('status', ['ACTIVE', 'PAST_DUE', 'GRACE_PERIOD']),
      db.from('payment_transactions')
        .select('transaction_type,amount,currency,occurred_at')
        .eq('organization_id', org)
        .in('transaction_type', ['CAPTURED', 'REFUNDED'])
        .gte('occurred_at', thirtyDaysAgo),
      db.from('invoices')
        .select('balance_due,currency,status')
        .eq('organization_id', org)
        .gt('balance_due', 0),
    ]);

  const firstError = [
    snapshotResult.error,
    scenariosResult.error,
    subscriptionsResult.error,
    paymentsResult.error,
    invoicesResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(`Founder Finance read failed: ${firstError.message}`);

  const pricingIds = [...new Set((subscriptionsResult.data ?? [])
    .map((row) => String(row.pricing_version_id ?? ''))
    .filter(Boolean))];

  const pricingResult = pricingIds.length
    ? await db.from('pricing_versions')
        .select('id,currency,billing_period,recurring_amount')
        .in('id', pricingIds)
    : { data: [], error: null };

  if (pricingResult.error) {
    throw new Error(`Founder Finance pricing read failed: ${pricingResult.error.message}`);
  }

  const pricingById = new Map(
    (pricingResult.data ?? []).map((row) => [String(row.id), row]),
  );
  const mrrRows: Array<{ currency: string; amount: number }> = [];
  for (const subscription of subscriptionsResult.data ?? []) {
    const pricing = pricingById.get(String(subscription.pricing_version_id));
    if (!pricing) continue;
    const recurring = number(pricing.recurring_amount);
    const monthly = String(pricing.billing_period).toUpperCase() === 'ANNUAL'
      ? recurring / 12
      : recurring;
    mrrRows.push({ currency: String(pricing.currency), amount: monthly });
  }
  const subscriptionMrr = aggregateCurrency(mrrRows);
  const subscriptionArr = subscriptionMrr.map((item) => ({
    currency: item.currency,
    amount: Number((item.amount * 12).toFixed(2)),
  }));

  const netRows: Array<{ currency: string; amount: number }> = [];
  for (const row of paymentsResult.data ?? []) {
    const amount = number(row.amount);
    netRows.push({
      currency: String(row.currency),
      amount: String(row.transaction_type).toUpperCase() === 'REFUNDED' ? -amount : amount,
    });
  }
  const netCaptured30dMap = new Map<string, number>();
  for (const row of netRows) {
    const currency = row.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) continue;
    netCaptured30dMap.set(currency, (netCaptured30dMap.get(currency) ?? 0) + row.amount);
  }
  const netCaptured30d = [...netCaptured30dMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => ({ currency, amount: Number(amount.toFixed(2)) }));

  const outstandingInvoices = aggregateCurrency(
    (invoicesResult.data ?? [])
      .filter((row) => String(row.status ?? '').toUpperCase() !== 'VOID')
      .map((row) => ({ currency: row.currency, amount: row.balance_due })),
  );

  const rawSnapshot = snapshotResult.data as Record<string, unknown> | null;
  const companySnapshot: CompanyFinancialSnapshotV1 | null = rawSnapshot ? {
    id: String(rawSnapshot.id),
    asOfDate: String(rawSnapshot.as_of_date),
    currency: String(rawSnapshot.currency),
    cashBalance: number(rawSnapshot.cash_balance),
    monthlyNetBurn: number(rawSnapshot.monthly_net_burn),
    monthlyPayroll: number(rawSnapshot.monthly_payroll),
    monthlySalesMarketingSpend: number(rawSnapshot.monthly_sales_marketing_spend),
    monthlyOtherOpex: number(rawSnapshot.monthly_other_opex),
    accountsReceivable: number(rawSnapshot.accounts_receivable),
    accountsPayable: number(rawSnapshot.accounts_payable),
    sourceType: String(rawSnapshot.source_type) as CompanyFinancialSnapshotV1['sourceType'],
    sourceRef: String(rawSnapshot.source_ref),
    createdAt: String(rawSnapshot.created_at),
  } : null;

  const scenarios = (scenariosResult.data ?? []).map((row) => {
    const scenario: FounderFinanceScenarioV1 = {
      id: String(row.id),
      name: String(row.name),
      status: String(row.status) as FounderFinanceScenarioV1['status'],
      currency: String(row.currency),
      cashBalanceAssumption: number(row.cash_balance_assumption),
      monthlyNetBurnAssumption: number(row.monthly_net_burn_assumption),
      monthlySalesMarketingSpendAssumption: number(row.monthly_sales_marketing_spend_assumption),
      newCustomersPerMonthAssumption: number(row.new_customers_per_month_assumption),
      monthlyArpaAssumption: number(row.monthly_arpa_assumption),
      grossMarginBpsAssumption: number(row.gross_margin_bps_assumption),
      monthlyChurnBpsAssumption: number(row.monthly_churn_bps_assumption),
      notes: row.notes ? String(row.notes) : undefined,
      version: Math.max(1, Number(row.version ?? 1)),
      updatedAt: String(row.updated_at),
    };
    return { scenario, metrics: calculateFounderFinanceScenario(scenario) };
  });

  const companyRunwayMonths = companySnapshot?.monthlyNetBurn
    ? Number((companySnapshot.cashBalance / companySnapshot.monthlyNetBurn).toFixed(2))
    : null;

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    companySnapshot,
    companyRunwayMonths,
    observed: {
      subscriptionMrr,
      subscriptionArr,
      netCaptured30d,
      outstandingInvoices,
    },
    scenarios,
    evidence: [
      {
        authority: 'COMPANY_FINANCE',
        quality: companySnapshot ? 'VERIFIED' : 'MISSING',
        count: companySnapshot ? 1 : 0,
        detail: companySnapshot
          ? 'Latest immutable OWNER-confirmed company cash/burn/opex snapshot.'
          : 'No OWNER-confirmed company financial snapshot exists.',
      },
      {
        authority: 'SUBSCRIPTION_BILLING',
        quality: 'VERIFIED',
        count: subscriptionsResult.data?.length ?? 0,
        detail: 'Observed recurring billing from canonical subscriptions and pricing versions; grouped by currency without FX conversion.',
      },
      {
        authority: 'PAYMENT_LEDGER',
        quality: 'VERIFIED',
        count: paymentsResult.data?.length ?? 0,
        detail: 'Observed CAPTURED minus REFUNDED payment transactions in the trailing 30 days; grouped by currency without FX conversion.',
      },
      {
        authority: 'INVOICE_LEDGER',
        quality: 'VERIFIED',
        count: invoicesResult.data?.length ?? 0,
        detail: 'Observed outstanding invoice balances from the canonical Invoice authority; grouped by currency without FX conversion.',
      },
    ],
  };
}
