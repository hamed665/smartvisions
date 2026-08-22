import { getQuote, type AddonId, type ServiceId } from '@/lib/outreach/pricing';
import type { MarketCode } from '@/lib/outreach/scheduler';
import type { ConversationSignals } from './intelligence';

export type CommercialPolicyInput = {
  serviceId: ServiceId;
  marketCode: MarketCode;
  requestedDiscountPct?: number;
  addons?: AddonId[];
  customScopeRequested?: boolean;
};

export function evaluateCommercialPolicy(input: CommercialPolicyInput) {
  const quote = getQuote({
    serviceId: input.serviceId,
    marketCode: input.marketCode,
    requestedDiscountPct: input.requestedDiscountPct,
    addons: input.addons,
  });

  const discountBeyondAutoLimit = quote.allowed ? quote.requiresHuman && (input.requestedDiscountPct ?? 0) > 0 : true;
  const customQuoteRequested = !!input.customScopeRequested || (quote.allowed && quote.customQuote);

  const conversationSignals: Pick<ConversationSignals, 'customQuoteRequested' | 'discountBeyondAutoLimit'> = {
    customQuoteRequested,
    discountBeyondAutoLimit,
  };

  return {
    quote,
    conversationSignals,
    safeForAutonomousQuote: quote.allowed && !quote.requiresHuman && !customQuoteRequested,
    requiresHuman: !quote.allowed || quote.requiresHuman || customQuoteRequested,
    providerCalls: 0,
    llmCalls: 0,
    estimatedApiCostUsd: 0,
  };
}
