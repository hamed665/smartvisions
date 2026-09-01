export type CanonicalAddonLine = { addonId: string; name: string; price: number };

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function evaluateCanonicalQuote(input: {
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  currency: string;
  minimumPrice: number;
  maxAutoDiscountPct: number;
  maxDiscountWithApprovalPct: number;
  requestedDiscountPct?: number;
  addons?: CanonicalAddonLine[];
  startingFrom?: boolean;
  requiresCustomQuote?: boolean;
}) {
  const requested = Math.max(0, Number(input.requestedDiscountPct ?? 0));
  const servicePrice = roundMoney(Number(input.servicePrice));
  const minimumPrice = Math.max(0, roundMoney(Number(input.minimumPrice ?? 0)));
  const autoMax = Math.max(0, Number(input.maxAutoDiscountPct ?? 0));
  const approvalMax = Math.max(autoMax, Number(input.maxDiscountWithApprovalPct ?? autoMax));
  const addons = input.addons ?? [];
  const addonsTotal = roundMoney(addons.reduce((sum, item) => sum + Number(item.price || 0), 0));
  const basePrice = roundMoney(servicePrice + addonsTotal);

  if (![requested, servicePrice, minimumPrice, autoMax, approvalMax].every(Number.isFinite)) {
    throw new Error('Canonical pricing contains an invalid numeric value');
  }
  if (servicePrice < 0 || minimumPrice > servicePrice) {
    throw new Error('Canonical price floor is inconsistent with the configured service price');
  }

  if (requested > approvalMax) {
    return {
      allowed: false,
      requiresHuman: true,
      reason: 'discount_above_configured_ceiling' as const,
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      servicePrice,
      basePrice,
      addons,
      addonsTotal,
      currency: input.currency,
      minimumPrice,
      maxAutoDiscountPct: autoMax,
      maxDiscountWithApprovalPct: approvalMax,
      priceSource: 'service_prices' as const,
    };
  }

  const discountedServicePrice = roundMoney(servicePrice * (1 - requested / 100));
  if (discountedServicePrice < minimumPrice) {
    return {
      allowed: false,
      requiresHuman: true,
      reason: 'discount_below_hard_price_floor' as const,
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      servicePrice,
      basePrice,
      addons,
      addonsTotal,
      currency: input.currency,
      minimumPrice,
      requestedDiscountPct: requested,
      priceSource: 'service_prices' as const,
    };
  }

  const requiresHuman = requested > autoMax || Boolean(input.requiresCustomQuote);
  const finalPrice = roundMoney(basePrice * (1 - requested / 100));
  return {
    allowed: true,
    requiresHuman,
    reason: requiresHuman ? 'human_approval_required' as const : 'configured_quote' as const,
    serviceId: input.serviceId,
    serviceName: input.serviceName,
    servicePrice,
    basePrice,
    finalPrice,
    addons,
    addonsTotal,
    currency: input.currency,
    discountPct: requested,
    minimumPrice,
    maxAutoDiscountPct: autoMax,
    maxDiscountWithApprovalPct: approvalMax,
    startingFrom: Boolean(input.startingFrom),
    customQuote: Boolean(input.requiresCustomQuote),
    priceSource: 'service_prices' as const,
  };
}
