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

export type CanonicalFirstTouchSections = {
  english?: string;
  arabic?: string;
  omaniArabic?: string;
};

const CANONICAL_OFFER_COPY: Record<string, CanonicalOfferCopy> = {
  business_website: { english: 'a clear standalone business website', omaniArabic: 'موقع أعمال مستقل وواضح' },
  premium_bilingual_website: { english: 'a focused bilingual website upgrade', omaniArabic: 'تطوير الموقع بشكل ثنائي اللغة' },
  custom_website: { english: 'a tailored website upgrade', omaniArabic: 'تطوير مخصص للموقع' },
  seo_growth: { english: 'targeted SEO improvements', omaniArabic: 'تحسينات مركزة للظهور في محركات البحث' },
  muscat_content_production: { english: 'focused on-site content production', omaniArabic: 'إنتاج محتوى ميداني بشكل مركز' },
  ai_reels_4: { english: 'a focused AI reels package', omaniArabic: 'باقة ريلز مركزة بالذكاء الاصطناعي' },
  ai_reels_8: { english: 'a focused AI reels package', omaniArabic: 'باقة ريلز مركزة بالذكاء الاصطناعي' },
  whatsapp_ai_setup: { english: 'a practical WhatsApp AI setup', omaniArabic: 'إعداد واتساب ذكي بشكل عملي' },
};

function canonicalObservation(sourceEvidence: string): CanonicalFirstTouchObservation | null {
  const evidence = sourceEvidence.trim();
  const lower = evidence.toLowerCase();

  if (
    lower.includes('known web presence is a directory/social/contact page rather than a standalone website')
    || lower.includes('only a social/contact/directory presence is known; no standalone website is present')
    || lower.includes('no standalone website is currently known')
  ) return {
    key: 'NO_STANDALONE_WEBSITE',
    sourceEvidence: evidence,
    english: 'your current public web presence appears to rely mainly on directory, social, or contact pages rather than a standalone website',
    omaniArabic: 'حضوركم الحالي على الويب ظاهر بشكل أساسي عبر صفحات دليل أو تواصل أو سوشال بدل موقع مستقل',
  };

  if (lower.includes('cached deterministic website audit marks seo quality as weak/poor')) return {
    key: 'SEO_AUDIT_WEAK',
    sourceEvidence: evidence,
    english: 'your website audit shows that the SEO performance could be improved',
    omaniArabic: 'السيو في موقعكم يحتاج تحسين',
  };

  if (lower.includes('arabic support is missing')) return {
    key: 'ARABIC_SUPPORT_MISSING',
    sourceEvidence: evidence,
    english: 'your website does not currently appear to support Arabic',
    omaniArabic: 'موقعكم حالياً ما يدعم اللغة العربية',
  };

  if (lower.includes('mobile quality is weak')) return {
    key: 'MOBILE_QUALITY_WEAK',
    sourceEvidence: evidence,
    english: "your website's mobile experience could be improved",
    omaniArabic: 'تجربة موقعكم على الجوال تحتاج تحسين',
  };

  if (lower.includes('cta/conversion quality is weak')) return {
    key: 'CTA_QUALITY_WEAK',
    sourceEvidence: evidence,
    english: "your website's call-to-action and conversion flow could be improved",
    omaniArabic: 'مسار الدعوة للإجراء والتحويل في موقعكم يحتاج تحسين',
  };

  if (lower.includes('no booking flow was detected')) return {
    key: 'BOOKING_FLOW_MISSING',
    sourceEvidence: evidence,
    english: 'your website does not appear to have a clear booking flow',
    omaniArabic: 'ما ظهر في موقعكم مسار واضح للحجز',
  };

  const broken = evidence.match(/(\d+) broken link\(s\) were detected/i);
  if (broken) {
    const count = broken[1];
    return {
      key: 'BROKEN_LINKS',
      sourceEvidence: evidence,
      english: `your website audit detected ${count} broken link${count === '1' ? '' : 's'}`,
      omaniArabic: `فحص موقعكم رصد ${count} رابط${count === '1' ? 'اً' : ''} ما يشتغل`,
    };
  }

  if (lower.includes('instagram presence is verified as inactive')) return {
    key: 'INSTAGRAM_INACTIVE',
    sourceEvidence: evidence,
    english: 'your Instagram presence appears to be inactive based on the verified account activity',
    omaniArabic: 'حساب الإنستغرام عندكم ظاهر غير نشط حسب النشاط المتحقق منه',
  };

  if (lower.includes('instagram/content quality is verified as weak')) return {
    key: 'INSTAGRAM_CONTENT_WEAK',
    sourceEvidence: evidence,
    english: 'your Instagram content quality could be improved based on the verified account review',
    omaniArabic: 'محتوى الإنستغرام عندكم يحتاج تحسين حسب المراجعة المتحققة',
  };

  if (lower.includes('whatsapp is a verified conversion/contact path and no booking flow was detected')) return {
    key: 'WHATSAPP_WITHOUT_BOOKING',
    sourceEvidence: evidence,
    english: 'WhatsApp is available as a verified contact channel, but your website does not appear to have a clear booking flow',
    omaniArabic: 'واتساب متوفر عندكم كوسيلة تواصل متحققة، لكن ما ظهر في الموقع مسار واضح للحجز',
  };

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
  if (!evidence.length) throw new Error('At least one verified business-specific observation is required');

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
      ? ['english_personal_observation_and_relevant_value', 'omani_arabic_equivalent_with_same_facts', 'one_shared_low_pressure_cta']
      : ['personal_observation', 'one_relevant_problem_or_opportunity', 'one_relevant_solution', 'one_short_benefit', 'low_pressure_cta'],
    compositionRules: isOmanFirstTouch
      ? [
        'English section first, Omani Arabic section second.',
        'Both sections must communicate the same verified facts and offer.',
        'Do not make the Arabic section heavier or more salesy than the English section.',
        'Keep the combined first touch concise; this is a bilingual opener, not two full sales pitches.',
        'After the customer replies, stop bilingual outreach and mirror the customer language.',
      ]
      : ['Use the planned single language and market tone.'],
    forbidden: ['generic agency brochure', 'invented facts', 'unverified claims', 'guaranteed results', 'irrelevant upsells', 'forced heavy dialect'],
  };
}

function renderEnglish(businessName: string, observation: CanonicalFirstTouchObservation, offer: CanonicalOfferCopy) {
  return `Hi ${businessName}, I noticed ${observation.english}. Based on that, ${offer.english} could be useful. Would it help if I sent you a short outline?`;
}

function renderArabic(businessName: string, observation: CanonicalFirstTouchObservation, offer: CanonicalOfferCopy) {
  return `هلا ${businessName}، لاحظنا إن ${observation.omaniArabic}. وبناءً على هالمعلومة، ممكن نساعدكم من خلال ${offer.omaniArabic}. إذا حابين، نرسل لكم ملخص قصير؟`;
}

export function buildCanonicalFirstTouchDraft(input: MessagePlanInput) {
  const observation = input.evidence
    .filter(Boolean)
    .map(canonicalObservation)
    .find((item): item is CanonicalFirstTouchObservation => item !== null);
  if (!observation) throw new Error('No supported verified first-touch observation is available');

  const offer = CANONICAL_OFFER_COPY[input.recommendedOffer];
  if (!offer) throw new Error('Recommended offer has no canonical first-touch copy');
  const businessName = input.businessName.trim();
  if (!businessName) throw new Error('businessName is required');

  const prioritizedEvidence = [observation.sourceEvidence, ...input.evidence.filter((item) => item && item !== observation.sourceEvidence)];
  const plan = buildMessagePlan({ ...input, evidence: prioritizedEvidence });
  const english = renderEnglish(businessName, observation, offer);
  const arabic = renderArabic(businessName, observation, offer);

  if (input.marketCode === 'OM') {
    return {
      plan,
      observation,
      offer,
      sections: { english, arabic, omaniArabic: arabic } as CanonicalFirstTouchSections,
      text: `${english}\n\n${arabic}`,
      subject: `A quick idea for ${businessName}`,
    };
  }

  if (String(plan.language).toLowerCase().startsWith('ar')) {
    return {
      plan,
      observation,
      offer,
      sections: { arabic } as CanonicalFirstTouchSections,
      text: arabic,
      subject: `فكرة سريعة لـ ${businessName}`,
    };
  }

  return {
    plan,
    observation,
    offer,
    sections: { english } as CanonicalFirstTouchSections,
    text: english,
    subject: `A quick idea for ${businessName}`,
  };
}

type OmanFirstTouchDraft = Omit<ReturnType<typeof buildCanonicalFirstTouchDraft>, 'sections'> & {
  sections: { english: string; arabic: string; omaniArabic: string };
};

export function buildOmanFirstTouchDraft(input: MessagePlanInput): OmanFirstTouchDraft {
  if (input.marketCode !== 'OM') throw new Error('Canonical Oman first-touch rendering is only available for market OM');
  const observation = input.evidence
    .filter(Boolean)
    .map(canonicalObservation)
    .find((item): item is CanonicalFirstTouchObservation => item !== null);
  if (!observation) throw new Error('No supported verified Oman first-touch observation is available');

  const draft = buildCanonicalFirstTouchDraft(input);
  if (!draft.sections.english || !draft.sections.arabic || !draft.sections.omaniArabic) {
    throw new Error('Canonical Oman first-touch Arabic section is unavailable');
  }
  return {
    ...draft,
    sections: {
      english: draft.sections.english,
      arabic: draft.sections.arabic,
      omaniArabic: draft.sections.omaniArabic,
    },
  };
}