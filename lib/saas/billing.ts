import type { SupabaseClient } from '@supabase/supabase-js';

export type SaasBillingLine = {
  id: string;
  lineNo: number;
  component: string;
  direction: 'CHARGE' | 'CREDIT';
  meterKey: string | null;
  quantity: number;
  includedQuantity: number;
  billableQuantity: number;
  unitPrice: number;
  amount: number;
  sourceType: string;
  sourceId: string | null;
  evidence: Record<string, unknown>;
};

export type SaasBillingStatement = {
  id: string;
  subscriptionId: string;
  pricingVersionId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  currency: string;
  setupTotal: number;
  platformTotal: number;
  featureTotal: number;
  channelTotal: number;
  seatTotal: number;
  aiUsageTotal: number;
  thirdPartyUsageTotal: number;
  overageTotal: number;
  discountTotal: number;
  taxTotal: number;
  subtotal: number;
  total: number;
  finalizedAt: string | null;
  createdAt: string;
  lines: SaasBillingLine[];
};

export type SaasBillingOverview = {
  subscription: null | {
    id: string;
    status: string;
    pricingVersionId: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    plan: null | {
      code: string;
      name: string;
    };
    pricing: null | {
      version: number;
      currency: string;
      billingPeriod: string;
      recurringAmount: number;
      setupFeeAmount: number;
      aiCostMultiplier: number;
    };
  };
  profile: null | {
    id: string;
    currency: string;
    taxBps: number;
    taxLabel: string | null;
    taxSource: string | null;
    providerCostUsdToCurrencyRate: number;
    rateSource: string | null;
    validFrom: string;
  };
  statements: SaasBillingStatement[];
  readiness: {
    hasSubscription: boolean;
    hasActivePricing: boolean;
    hasBillingProfile: boolean;
    collectionConfigured: false;
    couponAuthority: 'PENDING_SAAS_COUPONS';
  };
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function summarizeBillingFormula(statement: SaasBillingStatement) {
  return {
    setup: statement.setupTotal,
    platform: statement.platformTotal,
    features: statement.featureTotal,
    channels: statement.channelTotal,
    seats: statement.seatTotal,
    aiUsage: statement.aiUsageTotal,
    thirdPartyUsage: statement.thirdPartyUsageTotal,
    overage: statement.overageTotal,
    discounts: statement.discountTotal,
    tax: statement.taxTotal,
    total: statement.total,
  };
}

export async function loadSaasBillingOverview(input: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<SaasBillingOverview> {
  const { data: subscription, error: subscriptionError } = await input.supabase
    .from('subscriptions')
    .select('id,status,pricing_version_id,current_period_start,current_period_end,started_at')
    .eq('organization_id', input.organizationId)
    .in('status', ['TRIAL', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'SUSPENDED'])
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) {
    throw new Error(`SaaS billing subscription lookup failed: ${subscriptionError.message}`);
  }

  let pricingRow: Record<string, unknown> | null = null;
  let planRow: Record<string, unknown> | null = null;

  if (subscription?.pricing_version_id) {
    const { data, error } = await input.supabase
      .from('pricing_versions')
      .select('id,plan_id,version,status,currency,billing_period,recurring_amount,setup_fee_amount,ai_cost_multiplier')
      .eq('id', subscription.pricing_version_id)
      .maybeSingle();
    if (error) throw new Error(`SaaS billing pricing lookup failed: ${error.message}`);
    pricingRow = data as Record<string, unknown> | null;

    if (pricingRow?.plan_id) {
      const { data: planData, error: planError } = await input.supabase
        .from('plans')
        .select('code,name,status')
        .eq('id', pricingRow.plan_id)
        .maybeSingle();
      if (planError) throw new Error(`SaaS billing plan lookup failed: ${planError.message}`);
      planRow = planData as Record<string, unknown> | null;
    }
  }

  const currency = nullableString(pricingRow?.currency);
  let profile: SaasBillingOverview['profile'] = null;
  if (currency) {
    const { data, error } = await input.supabase
      .from('saas_billing_profiles')
      .select('id,currency,tax_bps,tax_label,tax_source,provider_cost_usd_to_currency_rate,rate_source,valid_from')
      .eq('organization_id', input.organizationId)
      .eq('currency', currency)
      .is('valid_to', null)
      .order('valid_from', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`SaaS billing profile lookup failed: ${error.message}`);
    if (data) {
      profile = {
        id: String(data.id),
        currency: String(data.currency),
        taxBps: Number(data.tax_bps),
        taxLabel: nullableString(data.tax_label),
        taxSource: nullableString(data.tax_source),
        providerCostUsdToCurrencyRate: numberValue(data.provider_cost_usd_to_currency_rate),
        rateSource: nullableString(data.rate_source),
        validFrom: String(data.valid_from),
      };
    }
  }

  const { data: statementRows, error: statementError } = await input.supabase
    .from('saas_billing_statements')
    .select('id,subscription_id,pricing_version_id,period_start,period_end,status,currency,setup_total,platform_total,feature_total,channel_total,seat_total,ai_usage_total,third_party_usage_total,overage_total,discount_total,tax_total,subtotal,total,finalized_at,created_at')
    .eq('organization_id', input.organizationId)
    .order('period_end', { ascending: false })
    .limit(24);

  if (statementError) {
    throw new Error(`SaaS billing statement lookup failed: ${statementError.message}`);
  }

  const ids = (statementRows ?? []).map(row => String(row.id));
  let lineRows: Array<Record<string, unknown>> = [];
  if (ids.length) {
    const { data, error } = await input.supabase
      .from('saas_billing_line_items')
      .select('id,statement_id,line_no,component,direction,meter_key,quantity,included_quantity,billable_quantity,unit_price,amount,source_type,source_id,evidence')
      .eq('organization_id', input.organizationId)
      .in('statement_id', ids)
      .order('line_no', { ascending: true });
    if (error) throw new Error(`SaaS billing line lookup failed: ${error.message}`);
    lineRows = (data ?? []) as Array<Record<string, unknown>>;
  }

  const linesByStatement = new Map<string, SaasBillingLine[]>();
  for (const row of lineRows) {
    const statementId = String(row.statement_id);
    const current = linesByStatement.get(statementId) ?? [];
    current.push({
      id: String(row.id),
      lineNo: Number(row.line_no),
      component: String(row.component),
      direction: String(row.direction) === 'CREDIT' ? 'CREDIT' : 'CHARGE',
      meterKey: nullableString(row.meter_key),
      quantity: numberValue(row.quantity),
      includedQuantity: numberValue(row.included_quantity),
      billableQuantity: numberValue(row.billable_quantity),
      unitPrice: numberValue(row.unit_price),
      amount: numberValue(row.amount),
      sourceType: String(row.source_type),
      sourceId: nullableString(row.source_id),
      evidence: record(row.evidence),
    });
    linesByStatement.set(statementId, current);
  }

  const statements: SaasBillingStatement[] = (statementRows ?? []).map(row => ({
    id: String(row.id),
    subscriptionId: String(row.subscription_id),
    pricingVersionId: String(row.pricing_version_id),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    status: String(row.status),
    currency: String(row.currency),
    setupTotal: numberValue(row.setup_total),
    platformTotal: numberValue(row.platform_total),
    featureTotal: numberValue(row.feature_total),
    channelTotal: numberValue(row.channel_total),
    seatTotal: numberValue(row.seat_total),
    aiUsageTotal: numberValue(row.ai_usage_total),
    thirdPartyUsageTotal: numberValue(row.third_party_usage_total),
    overageTotal: numberValue(row.overage_total),
    discountTotal: numberValue(row.discount_total),
    taxTotal: numberValue(row.tax_total),
    subtotal: numberValue(row.subtotal),
    total: numberValue(row.total),
    finalizedAt: nullableString(row.finalized_at),
    createdAt: String(row.created_at),
    lines: linesByStatement.get(String(row.id)) ?? [],
  }));

  const normalizedSubscription = subscription
    ? {
        id: String(subscription.id),
        status: String(subscription.status),
        pricingVersionId: String(subscription.pricing_version_id),
        currentPeriodStart: nullableString(subscription.current_period_start),
        currentPeriodEnd: nullableString(subscription.current_period_end),
        plan: planRow
          ? { code: String(planRow.code), name: String(planRow.name) }
          : null,
        pricing: pricingRow
          ? {
              version: Number(pricingRow.version),
              currency: String(pricingRow.currency),
              billingPeriod: String(pricingRow.billing_period),
              recurringAmount: numberValue(pricingRow.recurring_amount),
              setupFeeAmount: numberValue(pricingRow.setup_fee_amount),
              aiCostMultiplier: numberValue(pricingRow.ai_cost_multiplier),
            }
          : null,
      }
    : null;

  return {
    subscription: normalizedSubscription,
    profile,
    statements,
    readiness: {
      hasSubscription: Boolean(normalizedSubscription),
      hasActivePricing: pricingRow?.status === 'ACTIVE' && planRow?.status === 'ACTIVE',
      hasBillingProfile: Boolean(profile),
      collectionConfigured: false,
      couponAuthority: 'PENDING_SAAS_COUPONS',
    },
  };
}
