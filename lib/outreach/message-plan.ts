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
  const isOmanFirstTouch = input.marketCode === 'OM';
  const singleLanguage = chooseLanguage({
    marketCode: input.marketCode,
    detectedLanguage: input.detectedLanguage,
    preferredLanguage: input.preferredLanguage,
  });
  const languages = isOmanFirstTouch ? ['en', 'ar-OM'] : [singleLanguage];
  const language = isOmanFirstTouch ? 'en+ar-OM' : singleLanguage;

  const evidence = input.evidence.filter(Boolean).slice(0, 3);
  if (evidence.length === 0) throw new Error('At least one verified business-specific observation is required');

  return {
    businessName: input.businessName,
    industry: input.industry,
    recipientRole: input.recipientRole,
    language,
    languages,
    languageMode: isOmanFirstTouch ? 'BILINGUAL_FIRST_TOUCH' as const : 'SINGLE_LANGUAGE' as const,
    dialect: locale.dialect,
    tone: locale.tone,
    dialectIntensity: locale.dialectIntensity,
    maxWords: locale.maxFirstTouchWords,
    maxWordsPerLanguage: isOmanFirstTouch ? Math.max(20, Math.floor(locale.maxFirstTouchWords / 2)) : locale.maxFirstTouchWords,
    evidence,
    recommendedOffer: input.recommendedOffer,
    structure: isOmanFirstTouch
      ? [
        'english_personal_observation_and_relevant_value',
        'omani_arabic_equivalent_with_same_facts',
        'one_shared_low_pressure_cta',
      ]
      : [
        'personal_observation',
        'one_relevant_problem_or_opportunity',
        'one_relevant_solution',
        'one_short_benefit',
        'low_pressure_cta',
      ],
    compositionRules: isOmanFirstTouch
      ? [
        'English section first, Omani Arabic section second.',
        'Both sections must communicate the same verified facts and offer.',
        'Do not make the Arabic section heavier or more salesy than the English section.',
        'Keep the combined first touch concise; this is a bilingual opener, not two full sales pitches.',
        'After the customer replies, stop bilingual outreach and mirror the customer language.',
      ]
      : ['Use the planned single language and market tone.'],
    forbidden: [
      'generic agency brochure',
      'invented facts',
      'unverified claims',
      'guaranteed results',
      'irrelevant upsells',
      'forced heavy dialect',
      'continuing bilingual replies after the customer has chosen a language',
    ],
  };
}
