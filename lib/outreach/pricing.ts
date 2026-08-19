import pricingJson from '@/lib/config/pricing.json';
import marketsJson from '@/lib/config/markets.json';
import type { MarketCode } from './scheduler';

type PriceRecord = {
  name: string;
  prices: Partial<Record<MarketCode, number>>;
  maxAutoDiscountPct?: number;
  maxDiscountWithApprovalPct?: number;
  startingFrom?: boolean;
  requiresCustomQuote?: boolean;
};

export type ServiceId = keyof typeof pricingJson;

export function getQuote(input: {
  serviceId: ServiceId;
  marketCode: MarketCode;
  requestedDiscountPct?: number;
}) {
  const service = pricingJson[input.serviceId] as PriceRecord;
  const market = marketsJson[input.marketCode];
  const basePrice = service.prices[input.marketCode];
  if (basePrice == null) throw new Error(`No configured price for ${input.serviceId}/${input.marketCode}`);

  const requested = Math.max(0, input.requestedDiscountPct ?? 0);
  const autoMax = service.maxAutoDiscountPct ?? 0;
  const approvalMax = service.maxDiscountWithApprovalPct ?? autoMax;

  if (requested > approvalMax) {
    return {
      allowed: false,
      requiresHuman: true,
      reason: 'discount_above_configured_ceiling' as const,
      serviceName: service.name,
      basePrice,
      currency: market.currency,
    };
  }

  const requiresHuman = requested > autoMax || !!service.requiresCustomQuote;
  const finalPrice = Math.round(basePrice * (1 - requested / 100) * 100) / 100;

  return {
    allowed: true,
    requiresHuman,
    reason: requiresHuman ? 'human_approval_required' as const : 'configured_quote' as const,
    serviceName: service.name,
    basePrice,
    finalPrice,
    currency: market.currency,
    discountPct: requested,
    startingFrom: !!service.startingFrom,
    customQuote: !!service.requiresCustomQuote,
  };
}
