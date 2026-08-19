import pricingJson from '@/lib/config/pricing.json';
import addonsJson from '@/lib/config/addons.json';
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

type AddonRecord = {
  name: string;
  prices: Partial<Record<MarketCode, number>>;
};

export type ServiceId = keyof typeof pricingJson;
export type AddonId = keyof typeof addonsJson;

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function getQuote(input: {
  serviceId: ServiceId;
  marketCode: MarketCode;
  requestedDiscountPct?: number;
  addons?: AddonId[];
}) {
  const service = pricingJson[input.serviceId] as PriceRecord;
  const market = marketsJson[input.marketCode];
  const baseServicePrice = service.prices[input.marketCode];
  if (baseServicePrice == null) throw new Error(`No configured price for ${input.serviceId}/${input.marketCode}`);

  const addonLines = (input.addons ?? []).map((addonId) => {
    const addon = addonsJson[addonId] as AddonRecord;
    const price = addon.prices[input.marketCode];
    if (price == null) throw new Error(`No configured price for addon ${addonId}/${input.marketCode}`);
    return { addonId, name: addon.name, price };
  });

  const addonsTotal = addonLines.reduce((sum, item) => sum + item.price, 0);
  const basePrice = roundMoney(baseServicePrice + addonsTotal);
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
      baseServicePrice,
      addons: addonLines,
      addonsTotal,
      currency: market.currency,
    };
  }

  const requiresHuman = requested > autoMax || !!service.requiresCustomQuote;
  const finalPrice = roundMoney(basePrice * (1 - requested / 100));

  return {
    allowed: true,
    requiresHuman,
    reason: requiresHuman ? 'human_approval_required' as const : 'configured_quote' as const,
    serviceName: service.name,
    baseServicePrice,
    addons: addonLines,
    addonsTotal,
    basePrice,
    finalPrice,
    currency: market.currency,
    discountPct: requested,
    startingFrom: !!service.startingFrom,
    customQuote: !!service.requiresCustomQuote,
  };
}
