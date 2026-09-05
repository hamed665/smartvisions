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

export type CanonicalFirstTouchObservation = {
  key: string;
  sourceEvidence: string;
  english: string;
  omaniArabic: string;
};

type CanonicalOfferCopy = {
  english: string;
  omaniArabic: string;
};

const CANONICAL_OFFER_COPY: Record<string, CanonicalOfferCopy> = {
  business_website: {
    english: 'a clear standalone business website',
    omaniArabic: 'موقع أعمال مستقل وواضح',
  },
  premium_bilingual_website: {
    english: 'a focused bilingual website upgrade',
    omaniArabic: 'تطوير مركز للموقع ليكون ثنائي اللغة',
  },
  custom_website: {
    english: 'a tailored website upgrade',
    omaniArabic: 'تطوير مخصص للموقع',
  },
  seo_growth: {
    english: 'targeted SEO improvements',
    omaniArabic: 'تحسينات مركزة للظهور في محركات البحث',
  },
  muscat_content_production: {
    english: 'focused on-site content production',
    omaniArabic: 'إنتاج محتوى ميداني بشكل مركز',
  },
  ai_reels_4: {
    english: 'a focused AI reels package',
    omaniArabic: 'باقة ريلز بالذكاء الاصطناعي بشكل مركز',
  },
  ai_reels_8: {
    english: 'a focused AI reels package',
    omaniArabic: 'باقة ريلز بالذكاء الاصطناعي بشكل مركز',
  },
  whatsapp_ai_setup: {
    english: 'a focused WhatsApp AI setup',
    omaniArabic: 'إعداد واتساب ذكي بشكل مركز',
  },
};

function canonicalOmanObservation(sourceEvidence: string): CanonicalFirstTouchObservation | null {
  const evidence = sourceEvidence.trim();
  const lower = evidence.toLowerCase();

  if (
    lower.includes('known web presence is a directory/social/contact page rather than a standalone website')
    || lower.includes('only a social/contact/directory presence is known; no standalone website is present')
    || lower.includes('no standalone website is currently known')
  ) {
    return {
      key: 'NO_STANDALONE_WEBSITE',
      sourceEvidence: evidence,
      english: 'your current public web presence appears to be mainly directory, social, or contact pages rather than a standalone website',
      omaniArabic: 'حضوركم الحالي على الويب ظاهر بشكل أساسي عبر صفحات دليل أو تواصل أو سوشال، بدل موقع مستقل',
    };
  }

  if (lower.includes('cached deterministic website audit marks seo quality as weak/poor')) {
    return {
      key: 'SEO_AUDIT_WEAK',
      sourceEvidence: evidence,
      english: 'the verified website audit found weak SEO quality',
      omaniArabic: 'فحص الموقع المتحقق منه أظهر إن جودة السيو تحتاج تحسين',
    };
  }

  if (lower.includes('arabic support is missing')) {
    return {
      key: 'ARABIC_SUPPORT_MISSING',
      sourceEvidence: evidence,
      english: 'the verified website audit found that Arabic support is missing',
      omaniArabic: 'فحص الموقع المتحقق منه أظهر إن دعم اللغة العربية غير موجود',
    };
  }

  if (lower.includes('mobile quality is weak')) {
    return {
      key: 'MOBILE_QUALITY_WEAK',
      sourceEvidence: evidence,
      english: 'the verified website audit found weak mobile quality',
      omaniArabic: 'فحص الموقع المتحقق منه أظهر إن تجربة الموقع على الجوال تحتاج تحسين',
    };
  }

  if (lower.includes('cta/conversion quality is weak')) {
    return {
      key: 'CTA_QUALITY_WEAK',
      sourceEvidence: evidence,
      english: 'the verified website audit found a weak call-to-action and conversion flow',
      omaniArabic: 'فحص الموقع المتحقق منه أظهر إن مسار الدعوة للإجراء والتحويل يحتاج تحسين',
    };
  }

  if (lower.includes('no booking flow was detected')) {
    return {
      key: 'BOOKING_FLOW_MISSING',
      sourceEvidence: evidence,
      english: 'the verified website audit did not detect a booking flow',
      omaniArabic: 'فحص الموقع المتحقق منه ما رصد مسار واضح للحجز',
    };
  }

  const brokenLinks = evidence.match(/(\d+) broken link\(s\) were detected/i);
  if (brokenLinks) {
    const count = brokenLinks[1];
    return {
      key: 'BROKEN_LINKS',
      sourceEvidence: evidence,
      english: `the verified website audit detected ${count} broken link${count === '1' ? '' : 's'}`,
      omaniArabic: `فحص الموقع المتحقق منه رصد ${count} رابط${count === '1' ? '' : 'اً'} لا يعمل`,
    };
  }

  if (lower.includes('instagram presence is verified as inactive')) {
    return {
      key: 'INSTAGRAM_INACTIVE',
      sourceEvidence: evidence,
      english: 'the Instagram presence was verified as inactive',
      omaniArabic: 'حساب الإنستغرام تم التحقق منه وظهر إنه غير نشط',
    };
  }

  if (lower.includes('instagram/content quality is verified as weak')) {
    return {
      key: 'INSTAGRAM_CONTENT_WEAK',
      sourceEvidence: evidence,
      english: 'the Instagram content quality was verified as weak',
      omaniArabic: 'جودة محتوى الإنستغرام تم التحقق منها وظهرت إنها تحتاج تحسين',
    };
  }

  if (lower.includes('whatsapp is a verified conversion/contact path and no booking flow was detected')) {
    return {
      key: 'WHATSAPP_WITHOUT_BOOKING',
      sourceEvidence: evidence,
      english: 'WhatsApp is a verified contact path and the website audit did not detect a booking flow',
      omaniArabic: 'واتساب مسار تواصل متحقق منه، وفحص الموقع ما رصد مسار واضح للحجز',
    };
  }

  return null;
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

export function buildOmanFirstTouchDraft(input: MessagePlanInput) {
  if (input.marketCode !== 'OM') {
    throw new Error('Canonical Oman first-touch rendering is only available for market OM');
  }

  const observation = input.evidence
    .filter(Boolean)
    .map(canonicalOmanObservation)
    .find((item): item is CanonicalFirstTouchObservation => item !== null);
  if (!observation) {
    throw new Error('No supported verified Oman first-touch observation is available');
  }

  const prioritizedEvidence = [
    observation.sourceEvidence,
    ...input.evidence.filter((item) => item && item !== observation.sourceEvidence),
  ];
  const plan = buildMessagePlan({ ...input, evidence: prioritizedEvidence });
  if (plan.languageMode !== 'BILINGUAL_FIRST_TOUCH') {
    throw new Error('Canonical Oman first-touch plan must be bilingual');
  }

  const offer = CANONICAL_OFFER_COPY[input.recommendedOffer];
  if (!offer) throw new Error('Recommended offer has no canonical Oman first-touch copy');

  const businessName = input.businessName.trim();
  if (!businessName) throw new Error('businessName is required');

  const english = `Hi ${businessName}, I noticed ${observation.english}. ${offer.english} could be relevant based on that. Would a short outline be useful?`;
  const omaniArabic = `هلا ${businessName}، لاحظنا إن ${observation.omaniArabic}. بناءً على هالمعلومة، ${offer.omaniArabic} ممكن يكون مناسب. إذا يناسبكم، نرسل لكم ملخص قصير؟`;

  return {
    plan,
    observation,
    offer,
    sections: {
      english,
      omaniArabic,
    },
    text: `${english}\n\n${omaniArabic}`,
    subject: `A quick idea for ${businessName}`,
  };
}
