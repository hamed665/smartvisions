import { chooseLanguage, getLocaleProfile } from './locale';
import type { MarketCode } from './scheduler';

export interface MessagePlanInput {
  marketCode: MarketCode;
  businessName: string;
  industry?: string;
  detectedLanguage?: string;
  preferredLanguage?: string;
  evidence: string[];
  recommendedOffer: string;
  recipientRole?: string;
}

export function buildMessagePlan(input: MessagePlanInput) {
  const locale = getLocaleProfile(input.marketCode);
  const language = chooseLanguage({
    marketCode: input.marketCode,
    detectedLanguage: input.detectedLanguage,
    preferredLanguage: input.preferredLanguage,
  });

  const evidence = input.evidence.filter(Boolean).slice(0, 3);
  if (evidence.length === 0) throw new Error('At least one verified business-specific observation is required');

  return {
    businessName: input.businessName,
    industry: input.industry,
    recipientRole: input.recipientRole,
    language,
    dialect: locale.dialect,
    tone: locale.tone,
    dialectIntensity: locale.dialectIntensity,
    maxWords: locale.maxFirstTouchWords,
    evidence,
    recommendedOffer: input.recommendedOffer,
    structure: [
      'personal_observation',
      'one_relevant_problem_or_opportunity',
      'one_relevant_solution',
      'one_short_benefit',
      'low_pressure_cta',
    ],
    forbidden: [
      'generic agency brochure',
      'invented facts',
      'unverified claims',
      'guaranteed results',
      'irrelevant upsells',
      'forced heavy dialect',
    ],
  };
}
