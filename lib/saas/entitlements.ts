import type { SupabaseClient } from '@supabase/supabase-js';

export const LIVE_SUBSCRIPTION_STATES = [
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'SUSPENDED',
] as const;

export type LiveSubscriptionState = (typeof LIVE_SUBSCRIPTION_STATES)[number];

export type SaasBooleanEntitlement = {
  kind: 'BOOLEAN';
  enabled: boolean;
};

export type SaasLimitEntitlement = {
  kind: 'LIMIT';
  unit: string;
  limit?: number;
  unlimited?: true;
};

export type SaasSetEntitlement = {
  kind: 'SET';
  values: string[];
};

export type SaasEntitlementValue =
  | SaasBooleanEntitlement
  | SaasLimitEntitlement
  | SaasSetEntitlement;

export type EffectiveSaasEntitlement = {
  featureKey: string;
  value: SaasEntitlementValue;
  sourceType: string;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  planCode: string | null;
  pricingVersionId: string | null;
  overrideId: string | null;
  validFrom: string | null;
  validTo: string | null;
};

export type SaasSubscriptionSummary = {
  id: string;
  status: string;
  pricingVersionId: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  pricingVersion: {
    id: string;
    version: number;
    currency: string;
    billingPeriod: string;
    status: string;
  } | null;
  plan: {
    code: string;
    name: string;
    status: string;
  } | null;
};

export type SaasEntitlementSnapshot = {
  evaluatedAt: string;
  subscription: SaasSubscriptionSummary | null;
  entitlements: EffectiveSaasEntitlement[];
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function optionalString(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function finiteNonNegativeInteger(value: unknown) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function normalizeSaasEntitlementValue(value: unknown): SaasEntitlementValue {
  const input = record(value);
  const kind = String(input.kind ?? '').trim().toUpperCase();

  if (kind === 'BOOLEAN' && typeof input.enabled === 'boolean') {
    return { kind: 'BOOLEAN', enabled: input.enabled };
  }

  if (kind === 'SET' && Array.isArray(input.values)) {
    const values = input.values.map(item => String(item).trim().toUpperCase());
    if (
      values.some(item => !item)
      || values.length > 64
      || new Set(values).size !== values.length
    ) {
      throw new Error('Invalid SET entitlement');
    }
    return { kind: 'SET', values };
  }

  if (kind === 'LIMIT') {
    const unit = String(input.unit ?? '').trim().toUpperCase();
    if (!unit) throw new Error('Invalid LIMIT entitlement unit');

    if (input.unlimited === true && input.limit == null) {
      return { kind: 'LIMIT', unit, unlimited: true };
    }

    const limit = finiteNonNegativeInteger(input.limit);
    if (limit != null && input.unlimited == null) {
      return { kind: 'LIMIT', unit, limit };
    }
  }

  throw new Error('Invalid SaaS entitlement value');
}

export function saasEntitlementAllows(
  entitlement: SaasEntitlementValue | undefined,
  requested?: number | string,
) {
  if (!entitlement) return false;

  if (entitlement.kind === 'BOOLEAN') return entitlement.enabled;

  if (entitlement.kind === 'SET') {
    if (typeof requested !== 'string') return false;
    return entitlement.values.includes(requested.trim().toUpperCase());
  }

  if (entitlement.unlimited === true) return true;
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested < 0) return false;
  return requested <= Number(entitlement.limit ?? -1);
}

export async function loadSaasEntitlementSnapshot(input: {
  supabase: SupabaseClient;
  organizationId: string;
  at?: Date;
}): Promise<SaasEntitlementSnapshot> {
  const evaluatedAt = (input.at ?? new Date()).toISOString();

  const [{ data: rows, error: entitlementError }, { data: subscription, error: subscriptionError }] =
    await Promise.all([
      input.supabase.rpc('get_effective_saas_entitlements', {
        p_organization_id: input.organizationId,
        p_at: evaluatedAt,
      }),
      input.supabase
        .from('subscriptions')
        .select('id,status,pricing_version_id,current_period_start,current_period_end,started_at')
        .eq('organization_id', input.organizationId)
        .in('status', [...LIVE_SUBSCRIPTION_STATES])
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (entitlementError) {
    throw new Error(`SaaS entitlement resolution failed: ${entitlementError.message}`);
  }
  if (subscriptionError) {
    throw new Error(`SaaS subscription lookup failed: ${subscriptionError.message}`);
  }

  let pricingVersion: SaasSubscriptionSummary['pricingVersion'] = null;
  let plan: SaasSubscriptionSummary['plan'] = null;

  if (subscription?.pricing_version_id) {
    const { data: pricing, error: pricingError } = await input.supabase
      .from('pricing_versions')
      .select('id,plan_id,version,currency,billing_period,status')
      .eq('id', subscription.pricing_version_id)
      .maybeSingle();
    if (pricingError) throw new Error(`SaaS pricing lookup failed: ${pricingError.message}`);

    if (pricing) {
      pricingVersion = {
        id: String(pricing.id),
        version: Number(pricing.version),
        currency: String(pricing.currency),
        billingPeriod: String(pricing.billing_period),
        status: String(pricing.status),
      };

      const { data: planRow, error: planError } = await input.supabase
        .from('plans')
        .select('code,name,status')
        .eq('id', pricing.plan_id)
        .maybeSingle();
      if (planError) throw new Error(`SaaS plan lookup failed: ${planError.message}`);
      if (planRow) {
        plan = {
          code: String(planRow.code),
          name: String(planRow.name),
          status: String(planRow.status),
        };
      }
    }
  }

  const entitlements = (rows ?? []).map((row: Record<string, unknown>) => ({
    featureKey: String(row.feature_key),
    value: normalizeSaasEntitlementValue(row.entitlement_value),
    sourceType: String(row.source_type),
    subscriptionId: optionalString(row.subscription_id),
    subscriptionStatus: optionalString(row.subscription_status),
    planCode: optionalString(row.plan_code),
    pricingVersionId: optionalString(row.pricing_version_id),
    overrideId: optionalString(row.override_id),
    validFrom: optionalString(row.valid_from),
    validTo: optionalString(row.valid_to),
  }));

  return {
    evaluatedAt,
    subscription: subscription
      ? {
          id: String(subscription.id),
          status: String(subscription.status),
          pricingVersionId: String(subscription.pricing_version_id),
          currentPeriodStart: optionalString(subscription.current_period_start),
          currentPeriodEnd: optionalString(subscription.current_period_end),
          pricingVersion,
          plan,
        }
      : null,
    entitlements,
  };
}
