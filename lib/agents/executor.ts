import type { AgentContext, AgentName, AgentResult, CommercialDecision, ReplyDraft } from './contracts';
import * as core from './executor-core';
import { resolveReplyLanguage } from '@/lib/outreach/locale';
import { resolveSeptember2026Offer } from '@/lib/conversations/september-offer';
import { salesServiceKeyForCanonicalId } from '@/lib/conversations/service-key';
import { evaluateCanonicalQuote } from '@/lib/outreach/canonical-pricing';

function activeSeptemberOffer(context: AgentContext, decision?: CommercialDecision) {
  return resolveSeptember2026Offer({
    countryCode: context.countryCode,
    serviceId: decision?.serviceId ?? context.quotedService,
    selectedService: context.salesState?.selectedService,
    message: context.message,
    stage: context.salesState?.stage ?? context.stage,
    intentScore: context.intentScore,
  });
}

function canonicalQuote(context: AgentContext, decision: CommercialDecision) {
  const selectedService = context.salesState?.selectedService;
  const candidateServiceId = decision.serviceId || context.quotedService;
  const candidateMatchesSelection = !selectedService || salesServiceKeyForCanonicalId(candidateServiceId) === selectedService;
  const eligible = selectedService
    ? (context.serviceKnowledge ?? []).filter((item) => salesServiceKeyForCanonicalId(item.id) === selectedService)
    : (context.serviceKnowledge ?? []);
  const service = candidateMatchesSelection
    ? eligible.find((item) => item.id === candidateServiceId)
    : eligible.length === 1 ? eligible[0] : undefined;
  const serviceId = service?.id ?? (candidateMatchesSelection ? candidateServiceId : undefined);
  const marketPrice = service?.marketPrice;
  if (marketPrice && Number.isFinite(marketPrice.price) && marketPrice.currency) {
    return {
      serviceId: service!.id,
      serviceName: service!.name,
      price: Number(marketPrice.price),
      currency: marketPrice.currency,
      minimumPrice: Number(marketPrice.minimumPrice ?? 0),
      maxAutoDiscountPct: Number(marketPrice.maxAutoDiscountPct ?? 0),
      maxDiscountWithApprovalPct: Number(marketPrice.maxDiscountWithApprovalPct ?? 0),
      startingFrom: service?.config?.startingFrom === true,
      requiresCustomQuote: service?.config?.requiresCustomQuote === true,
    };
  }
  if (candidateMatchesSelection && Number.isFinite(context.quotedPrice) && context.quotedCurrency && serviceId) {
    return {
      serviceId,
      serviceName: service?.name ?? serviceId,
      price: Number(context.quotedPrice),
      currency: context.quotedCurrency,
      minimumPrice: 0,
      maxAutoDiscountPct: 0,
      maxDiscountWithApprovalPct: 0,
      startingFrom: false,
      requiresCustomQuote: false,
    };
  }
  return null;
}

function discountSpecificQuestion(message: string) {
  return /\b(?:discount|best price|last price|offer|deal)\b|(?:خصم|تخفيض|عرض|آخر سعر)|(?:تخفیف|آفر|پیشنهاد)/i.test(message);
}

function septemberOfferLine(context: AgentContext, decision: CommercialDecision, draftLanguage: string) {
  const offer = activeSeptemberOffer(context, decision);
  if (!offer?.reveal) return null;

  const arabic = /[\u0600-\u06FF]/.test(context.message) && !/[پچژگک]/.test(context.message);
  const persian = /^(?:fa|fa-|persian)/i.test(draftLanguage) || /[پچژگک]/.test(context.message);

  if (offer.noDiscount) {
    if (!discountSpecificQuestion(context.message)) return null;
    if (persian) return 'پکیج AI Agent تنها سرویس کمپین سپتامبر است که تخفیف ندارد.';
    if (arabic) return 'باقة AI Agent هي الخدمة الوحيدة في عرض سبتمبر بدون خصم.';
    return 'AI Agent is the one September package that is not discounted.';
  }

  const quote = canonicalQuote(context, decision);
  if (quote) {
    const campaignQuote = evaluateCanonicalQuote({
      serviceId: quote.serviceId,
      serviceName: quote.serviceName,
      servicePrice: quote.price,
      currency: quote.currency,
      minimumPrice: quote.minimumPrice,
      maxAutoDiscountPct: quote.maxAutoDiscountPct,
      maxDiscountWithApprovalPct: quote.maxDiscountWithApprovalPct,
      requestedDiscountPct: offer.discountPct,
      authorizedCampaignDiscountPct: offer.discountPct,
      authorizedCampaignId: offer.campaignId,
      startingFrom: quote.startingFrom,
      requiresCustomQuote: quote.requiresCustomQuote,
    });
    if (!campaignQuote.allowed || campaignQuote.finalPrice == null) return null;
    const finalPrice = campaignQuote.finalPrice;
    if (persian) return `برای سپتامبر، این سرویس ${offer.discountPct}٪ تخفیف دارد و قیمت کمپین ${finalPrice} ${quote.currency} می‌شود.`;
    if (arabic) return `لعرض سبتمبر، هالخدمة عليها خصم ${offer.discountPct}٪، ويصير سعر الحملة ${finalPrice} ${quote.currency}.`;
    return `For September, this service has ${offer.discountPct}% off, so the campaign price is ${finalPrice} ${quote.currency}.`;
  }

  if (persian) return `برای سپتامبر، این سرویس ${offer.discountPct}٪ تخفیف دارد؛ قیمت نهایی فقط از قیمت رسمی همان پکیج محاسبه می‌شود.`;
  if (arabic) return `لعرض سبتمبر، هالخدمة عليها خصم ${offer.discountPct}٪؛ والسعر النهائي ينحسب فقط من السعر الرسمي لنفس الباقة.`;
  return `For September, this service has ${offer.discountPct}% off; the final amount is calculated only from that package’s configured price.`;
}

export async function executeAgent(agent: AgentName, context: AgentContext): Promise<AgentResult> {
  const style = context.marketLocaleStyle;
  if (agent === 'culture_locale' && style) {
    const locale = resolveReplyLanguage({
      message: context.message,
      primaryLocale: style.primaryLocale,
      fallbackLocale: style.fallbackLocale,
      preferredLanguage: context.language,
    });
    return {
      agent,
      confidence: 0.97,
      summary: 'Applied customer language evidence before canonical owner-configured market style.',
      data: {
        locale,
        dialect: locale.toLowerCase().startsWith('ar') ? context.dialect ?? style.dialect ?? null : null,
        tone: style.toneProfile ?? 'professional',
        dialectIntensity: style.dialectIntensity ?? null,
        maxFirstTouchWords: style.maxFirstTouchWords ?? null,
        maxReplyWords: style.maxReplyWords ?? null,
      },
      evidence: [],
      blockers: [],
    };
  }
  return core.executeAgent(agent, context);
}

export function decideCommercialAction(context: AgentContext, results: AgentResult[]): CommercialDecision {
  const decision = core.decideCommercialAction(context, results);
  const offer = activeSeptemberOffer(context, decision);
  if (!offer?.reveal) return decision;
  if (offer.noDiscount) {
    return {
      ...decision,
      useDiscount: false,
      discountPct: undefined,
      reasons: [...decision.reasons, offer.campaignId, 'CAMPAIGN_NO_DISCOUNT'],
    };
  }
  return {
    ...decision,
    useDiscount: true,
    discountPct: offer.discountPct,
    reasons: [...decision.reasons, offer.campaignId],
  };
}

export function secretaryCompose(context: AgentContext, decision: CommercialDecision, results: AgentResult[]): ReplyDraft {
  const draft = core.secretaryCompose(context, decision, results);
  const offerLine = septemberOfferLine(context, decision, draft.language);
  if (!offerLine || draft.text.includes(offerLine)) return draft;
  if (decision.useDiscount && decision.discountPct != null && new RegExp(`${decision.discountPct}\\s*%|${decision.discountPct}\\s*٪`).test(draft.text)) return draft;
  return { ...draft, text: `${draft.text.trim()} ${offerLine}`.trim() };
}

export const checkRelevance = core.checkRelevance;
