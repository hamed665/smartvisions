import type { MessagePlanInput } from './message-plan';
import type { MarketCode } from './scheduler';

export type GrowthSalesNextAction = 'SKIP' | 'CONTACT_READY' | 'SOCIAL_CHECK' | 'WEBSITE_EVIDENCE' | 'EVIDENCE_READY';

export interface GrowthSalesContextInput {
  marketCode: MarketCode;
  businessName: string;
  industry?: string;
  preferredLanguage?: string;
  detectedLanguage?: string;
  recipientRole?: string;
  offerBundle: string[];
  recommendedAngle?: string | null;
  messageHooks: string[];
  personalizationFingerprint?: string[];
  nextAction: GrowthSalesNextAction;
}

const nonEvidenceHooks = [
  'Social-content quality is not claimed until evidence is checked.',
];

function compactUnique(values: string[], limit: number) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

export function buildGrowthSalesContext(input: GrowthSalesContextInput) {
  if (input.nextAction === 'SKIP') throw new Error('Skipped growth opportunities cannot enter sales messaging');

  const offerBundle = compactUnique(input.offerBundle, 6);
  if (offerBundle.length === 0) throw new Error('At least one routed service is required');

  const verifiedEvidence = compactUnique(
    input.messageHooks.filter((hook) => !nonEvidenceHooks.includes(hook)),
    3,
  );
  if (verifiedEvidence.length === 0) throw new Error('At least one verified growth observation is required');

  const recommendedOffer = offerBundle.join(' + ');
  const messagePlanInput: MessagePlanInput = {
    marketCode: input.marketCode,
    businessName: input.businessName,
    industry: input.industry,
    detectedLanguage: input.detectedLanguage,
    preferredLanguage: input.preferredLanguage,
    recipientRole: input.recipientRole,
    evidence: verifiedEvidence,
    recommendedOffer,
  };

  return {
    messagePlanInput,
    offerBundle,
    recommendedOffer,
    recommendedAngle: input.recommendedAngle?.trim() || 'practical digital growth improvements',
    personalizationFingerprint: compactUnique(input.personalizationFingerprint ?? [], 8),
    nextAction: input.nextAction,
    providerCalls: 0,
    llmCalls: 0,
    estimatedApiCostUsd: 0,
  };
}
