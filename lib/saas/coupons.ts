import type { SupabaseClient } from '@supabase/supabase-js';

export type SaasCouponRedemption = {
  id: string;
  couponId: string;
  couponCode: string;
  couponName: string;
  benefitType: 'FIXED' | 'PERCENTAGE' | 'FREE_SETUP' | 'TRIAL';
  subscriptionId: string;
  statementId: string;
  currency: string;
  discountAmount: number;
  redeemedAt: string;
  evidence: Record<string, unknown>;
};

export type SaasCouponOverview = {
  authority: 'AVAILABLE';
  stackingPolicy: 'ONE_COUPON_PER_STATEMENT';
  paymentCollectionExecuted: false;
  redemptions: SaasCouponRedemption[];
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function loadSaasCouponOverview(input: {
  supabase: SupabaseClient;
  organizationId: string;
}): Promise<SaasCouponOverview> {
  const { data: redemptionRows, error: redemptionError } = await input.supabase
    .from('saas_coupon_redemptions')
    .select('id,coupon_id,subscription_id,statement_id,currency,discount_amount,evidence,redeemed_at')
    .eq('organization_id', input.organizationId)
    .order('redeemed_at', { ascending: false })
    .limit(100);

  if (redemptionError) {
    throw new Error(`SaaS coupon redemption lookup failed: ${redemptionError.message}`);
  }

  const couponIds = [...new Set((redemptionRows ?? []).map(row => String(row.coupon_id)))];
  const couponsById = new Map<string, {
    code: string;
    name: string;
    benefitType: SaasCouponRedemption['benefitType'];
  }>();

  if (couponIds.length) {
    const { data: couponRows, error: couponError } = await input.supabase
      .from('saas_coupons')
      .select('id,code,name,benefit_type')
      .in('id', couponIds);

    if (couponError) {
      throw new Error(`SaaS coupon definition lookup failed: ${couponError.message}`);
    }

    for (const row of couponRows ?? []) {
      const type = String(row.benefit_type);
      if (!['FIXED', 'PERCENTAGE', 'FREE_SETUP', 'TRIAL'].includes(type)) continue;
      couponsById.set(String(row.id), {
        code: String(row.code),
        name: String(row.name),
        benefitType: type as SaasCouponRedemption['benefitType'],
      });
    }
  }

  return {
    authority: 'AVAILABLE',
    stackingPolicy: 'ONE_COUPON_PER_STATEMENT',
    paymentCollectionExecuted: false,
    redemptions: (redemptionRows ?? []).map(row => {
      const coupon = couponsById.get(String(row.coupon_id));
      return {
        id: String(row.id),
        couponId: String(row.coupon_id),
        couponCode: coupon?.code ?? 'REDACTED',
        couponName: coupon?.name ?? 'Coupon',
        benefitType: coupon?.benefitType ?? 'FIXED',
        subscriptionId: String(row.subscription_id),
        statementId: String(row.statement_id),
        currency: String(row.currency),
        discountAmount: numberValue(row.discount_amount),
        redeemedAt: String(row.redeemed_at),
        evidence: record(row.evidence),
      };
    }),
  };
}
