import { getPreviewTemplate, getTemplateDesign } from './templates';
import type {
  PreviewDocument,
  PreviewInput,
  PreviewLocale,
  PreviewLocalizedCopy,
  PreviewSection,
  PreviewVertical,
} from './types';

const experienceItems: Record<PreviewLocale, string[]> = {
  en: ['Clear service overview', 'Fast mobile contact', 'Simple next step'],
  ar: ['عرض واضح للخدمات', 'تواصل سريع على الجوال', 'خطوة تالية بسيطة'],
};

function verticalLabel(vertical: PreviewVertical, locale: PreviewLocale) {
  const labels: Record<PreviewVertical, [string, string]> = {
    dental: ['Dental care', 'العناية بالأسنان'],
    clinic: ['Healthcare', 'الرعاية الصحية'],
    beauty: ['Beauty & wellness', 'الجمال والعناية'],
    salon: ['Salon experience', 'تجربة الصالون'],
    restaurant: ['Dining', 'المطعم'],
    cafe: ['Cafe', 'المقهى'],
    hospitality: ['Hospitality', 'الضيافة'],
    pet_clinic: ['Pet care', 'رعاية الحيوانات'],
    real_estate: ['Property', 'العقارات'],
    automotive: ['Automotive', 'السيارات'],
    fitness: ['Fitness', 'اللياقة'],
    professional: ['Professional services', 'الخدمات المهنية'],
    corporate: ['Business services', 'خدمات الأعمال'],
    general: ['Services', 'الخدمات'],
  };
  return locale === 'ar' ? labels[vertical][1] : labels[vertical][0];
}

function ctaFor(vertical: PreviewVertical, locale: PreviewLocale) {
  const isArabic = locale === 'ar';
  if (vertical === 'restaurant' || vertical === 'cafe') return isArabic ? 'احجز الآن' : 'Reserve now';
  if (vertical === 'hospitality') return isArabic ? 'تحقق من التوفر' : 'Check availability';
  if (vertical === 'real_estate') return isArabic ? 'اطلب معاينة' : 'Request a viewing';
  if (vertical === 'automotive') return isArabic ? 'احجز خدمة' : 'Book a service';
  if (vertical === 'fitness') return isArabic ? 'ابدأ الآن' : 'Get started';
  if (vertical === 'professional' || vertical === 'corporate' || vertical === 'general') return isArabic ? 'اطلب استشارة' : 'Request a consultation';
  return isArabic ? 'احجز موعداً' : 'Book an appointment';
}

function safeHeadline(input: PreviewInput, locale: PreviewLocale) {
  const category = locale === 'ar'
    ? (/\p{Script=Arabic}/u.test(input.categoryLabel ?? '') ? input.categoryLabel!.trim() : verticalLabel(input.vertical, 'ar'))
    : (input.categoryLabel?.trim() || verticalLabel(input.vertical, 'en'));
  if (locale === 'ar') {
    if (input.vertical === 'restaurant' || input.vertical === 'cafe' || input.vertical === 'hospitality') {
      return `${input.businessName}، تجربة رقمية تضع المكان في الواجهة`;
    }
    if (input.vertical === 'real_estate') return `${input.businessName}، عرض عقاري أكثر وضوحاً وثقة`;
    if (input.vertical === 'automotive') return `${input.businessName}، حضور رقمي يواكب جودة الخدمة`;
    return `${input.businessName}، تجربة ${category} أوضح وأسهل على الجوال`;
  }
  if (input.vertical === 'restaurant' || input.vertical === 'cafe' || input.vertical === 'hospitality') {
    return `${input.businessName}, a digital experience that puts the venue first`;
  }
  if (input.vertical === 'real_estate') return `${input.businessName}, property presented with more clarity and confidence`;
  if (input.vertical === 'automotive') return `${input.businessName}, a digital presence built around the service experience`;
  return `${input.businessName}, a clearer ${category.toLowerCase()} experience on every screen`;
}

function safeSubheadline(input: PreviewInput, locale: PreviewLocale) {
  const location = input.city?.trim();
  if (locale === 'ar') {
    return `تصور أولي حديث ومهيأ للجوال، ينظم المعلومات المهمة ويجعل التواصل والخطوة التالية واضحة${location ? ` لعملاء ${location}` : ''}.`;
  }
  return `A modern, mobile-first concept that organizes the important information and makes the next action obvious${location ? ` for customers in ${location}` : ''}.`;
}

function proofBody(input: PreviewInput, locale: PreviewLocale) {
  const rating = Number(input.rating);
  const count = Number(input.reviewCount);
  if (Number.isFinite(rating) && rating >= 1 && rating <= 5 && Number.isFinite(count) && count > 0) {
    return locale === 'ar'
      ? `تقييم Google المؤكد ${rating.toFixed(1)} من 5 بناءً على ${Math.round(count)} تقييماً، مع إبراز هذه الثقة بدون إضافة ادعاءات غير موثقة.`
      : `Verified Google rating: ${rating.toFixed(1)} out of 5 from ${Math.round(count)} reviews, surfaced as real trust evidence without invented claims.`;
  }
  return locale === 'ar'
    ? 'ترتيب واضح للمحتوى، مساحات مريحة، وتسلسل يساعد العميل على فهم النشاط والوصول إلى الإجراء المطلوب بسرعة.'
    : 'Clear hierarchy, generous spacing and a focused journey help the visitor understand the business and reach the right action quickly.';
}

function buildLocalizedCopy(input: PreviewInput, locale: PreviewLocale, sectionOrder: PreviewSection['kind'][]): PreviewLocalizedCopy {
  const isArabic = locale === 'ar';
  const verifiedServices = (input.services ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 6);
  const serviceItems = verifiedServices.length ? verifiedServices : experienceItems[locale];
  const locationText = input.address?.trim() || input.city?.trim();
  const primaryCta = ctaFor(input.vertical, locale);
  const secondaryCta = input.whatsapp ? (isArabic ? 'تواصل عبر واتساب' : 'Chat on WhatsApp') : undefined;

  const headings = {
    services: isArabic ? 'تجربة خدمات مرتبة وواضحة' : 'Services, easier to explore',
    proof: isArabic ? 'الثقة تبدأ من الوضوح' : 'Trust starts with clarity',
    gallery: isArabic ? 'مساحة بصرية للعلامة' : 'A visual space for the brand',
    booking: isArabic ? 'خطوة تالية بلا تعقيد' : 'A frictionless next step',
    location: locationText ? (isArabic ? `الموقع · ${locationText}` : `Location · ${locationText}`) : (isArabic ? 'الموقع والتواصل' : 'Location & contact'),
    offer: isArabic ? 'ما يهم العميل أولاً' : 'What matters first',
  };

  const sections: Record<PreviewSection['kind'], PreviewSection> = {
    hero: { kind: 'hero', heading: safeHeadline(input, locale), body: safeSubheadline(input, locale) },
    services: { kind: 'services', heading: headings.services, items: serviceItems },
    proof: { kind: 'proof', heading: headings.proof, body: proofBody(input, locale) },
    gallery: { kind: 'gallery', heading: headings.gallery, items: (input.imageUrls ?? []).filter(Boolean).slice(0, 6) },
    booking: {
      kind: 'booking',
      heading: headings.booking,
      body: isArabic ? 'الحجز أو التواصل يبقى واضحاً وسهل الوصول إليه، خصوصاً على الجوال.' : 'Booking or contact stays visible and easy to reach, especially on mobile.',
    },
    location: { kind: 'location', heading: headings.location, body: [locationText, input.phone].filter(Boolean).join(' · ') || undefined },
    offer: { kind: 'offer', heading: headings.offer, items: serviceItems.slice(0, 3) },
  };

  return {
    locale,
    headline: safeHeadline(input, locale),
    subheadline: safeSubheadline(input, locale),
    primaryCta,
    secondaryCta,
    sections: sectionOrder.map((kind) => sections[kind]),
    disclaimer: isArabic
      ? 'هذا تصور تصميمي أولي مبني على معلومات موثقة أو عناصر آمنة، وليس الموقع النهائي أو ادعاءً بالهوية الحالية.'
      : 'This is an initial concept built from verified facts or safe design elements, not the final website or a claim about the current brand.',
  };
}

export function isPreviewEligible(input: PreviewInput) {
  const reasons: string[] = [];
  if (!input.businessName.trim()) reasons.push('BUSINESS_NAME_REQUIRED');
  if (!input.languageSource) reasons.push('SITE_LANGUAGE_SOURCE_REQUIRED');
  if (!(input.explicitRequest || (input.intentScore ?? 0) >= 60)) reasons.push('INTEREST_THRESHOLD_NOT_MET');
  return { eligible: reasons.length === 0, reasons };
}

export function generatePreview(input: PreviewInput): PreviewDocument {
  const template = getPreviewTemplate(input.vertical, { brandHint: input.brandHint });
  const availableLocales: PreviewLocale[] = input.language === 'bilingual' ? ['en', 'ar'] : [input.language];
  const primaryLocale: PreviewLocale = input.language === 'ar' ? 'ar' : 'en';
  const localized = Object.fromEntries(
    availableLocales.map((locale) => [locale, buildLocalizedCopy(input, locale, template.sectionOrder)]),
  ) as Partial<Record<PreviewLocale, PreviewLocalizedCopy>>;
  const copy = localized[primaryLocale]!;
  const imageUrls = (input.imageUrls ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 6);

  return {
    businessName: input.businessName.trim(),
    vertical: input.vertical,
    templateId: template.id,
    language: input.language,
    languageSource: input.languageSource,
    primaryLocale,
    availableLocales,
    direction: primaryLocale === 'ar' ? 'rtl' : 'ltr',
    headline: copy.headline,
    subheadline: copy.subheadline,
    primaryCta: copy.primaryCta,
    secondaryCta: copy.secondaryCta,
    sections: copy.sections,
    localized,
    design: getTemplateDesign(template),
    assets: { logoUrl: input.logoUrl, imageUrls },
    evidence: {
      categoryLabel: input.categoryLabel,
      address: input.address,
      rating: Number.isFinite(Number(input.rating)) ? Number(input.rating) : undefined,
      reviewCount: Number.isFinite(Number(input.reviewCount)) ? Number(input.reviewCount) : undefined,
    },
    assetMode: input.logoUrl || imageUrls.length > 0 ? 'verified_business_assets' : 'safe_placeholders',
    disclaimer: copy.disclaimer,
  };
}
