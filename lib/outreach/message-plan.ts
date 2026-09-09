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

export type CanonicalFirstTouchObservation = { key:string; sourceEvidence:string; english:string; arabic:string };
type CanonicalOfferCopy = { english:string; arabic:string };
export type CanonicalFirstTouchSections = { english:string; arabic?:string; omaniArabic?:string };
const GULF_MARKETS = new Set<MarketCode>(['OM','AE','SA','QA']);
const CANONICAL_OFFER_COPY:Record<string,CanonicalOfferCopy>={
  business_website:{english:'a clear standalone business website',arabic:'موقع أعمال مستقل وواضح'},premium_bilingual_website:{english:'a focused bilingual website upgrade',arabic:'تطوير مركز للموقع باللغتين'},custom_website:{english:'a tailored website upgrade',arabic:'تطوير مخصص للموقع'},seo_growth:{english:'targeted SEO improvements',arabic:'تحسينات مركزة للظهور في محركات البحث'},muscat_content_production:{english:'focused on-site content production',arabic:'إنتاج محتوى ميداني بشكل مركز'},ai_reels_4:{english:'a focused AI reels package',arabic:'باقة ريلز مركزة بالذكاء الاصطناعي'},ai_reels_8:{english:'a focused AI reels package',arabic:'باقة ريلز مركزة بالذكاء الاصطناعي'},whatsapp_ai_setup:{english:'a practical WhatsApp AI setup',arabic:'إعداد واتساب ذكي بشكل عملي'},
};
function canonicalObservation(sourceEvidence:string):CanonicalFirstTouchObservation|null{
  const evidence=sourceEvidence.trim();const lower=evidence.toLowerCase();
  if(lower.includes('known web presence is a directory/social/contact page rather than a standalone website')||lower.includes('only a social/contact/directory presence is known; no standalone website is present')||lower.includes('no standalone website is currently known'))return{key:'NO_STANDALONE_WEBSITE',sourceEvidence:evidence,english:'your current public web presence appears to rely mainly on directory, social, or contact pages rather than a standalone website',arabic:'حضوركم الحالي على الويب ظاهر بشكل أساسي عبر صفحات دليل أو تواصل أو سوشال بدل موقع مستقل'};
  if(lower.includes('cached deterministic website audit marks seo quality as weak/poor'))return{key:'SEO_AUDIT_WEAK',sourceEvidence:evidence,english:'your website audit shows that the SEO performance could be improved',arabic:'السيو في موقعكم يحتاج تحسين'};
  if(lower.includes('arabic support is missing'))return{key:'ARABIC_SUPPORT_MISSING',sourceEvidence:evidence,english:'your website does not currently appear to support Arabic',arabic:'موقعكم حالياً ما يظهر فيه دعم واضح للغة العربية'};
  if(lower.includes('mobile quality is weak'))return{key:'MOBILE_QUALITY_WEAK',sourceEvidence:evidence,english:"your website's mobile experience could be improved",arabic:'تجربة موقعكم على الجوال تحتاج تحسين'};
  if(lower.includes('cta/conversion quality is weak'))return{key:'CTA_QUALITY_WEAK',sourceEvidence:evidence,english:"your website's call-to-action and conversion flow could be improved",arabic:'مسار الدعوة للإجراء والتحويل في موقعكم يحتاج تحسين'};
  if(lower.includes('no booking flow was detected'))return{key:'BOOKING_FLOW_MISSING',sourceEvidence:evidence,english:'your website does not appear to have a clear booking flow',arabic:'ما ظهر في موقعكم مسار واضح للحجز'};
  const broken=evidence.match(/(\d+) broken link\(s\) were detected/i);if(broken){const count=broken[1];return{key:'BROKEN_LINKS',sourceEvidence:evidence,english:`your website audit detected ${count} broken link${count==='1'?'':'s'}`,arabic:`فحص موقعكم رصد ${count} رابط${count==='1'?'اً':''} لا يعمل`};}
  if(lower.includes('instagram presence is verified as inactive'))return{key:'INSTAGRAM_INACTIVE',sourceEvidence:evidence,english:'your Instagram presence appears to be inactive based on the verified account activity',arabic:'حساب الإنستغرام عندكم ظاهر غير نشط حسب النشاط المتحقق منه'};
  if(lower.includes('instagram/content quality is verified as weak'))return{key:'INSTAGRAM_CONTENT_WEAK',sourceEvidence:evidence,english:'your Instagram content quality could be improved based on the verified account review',arabic:'محتوى الإنستغرام عندكم يحتاج تحسين حسب المراجعة المتحققة'};
  if(lower.includes('whatsapp is a verified conversion/contact path and no booking flow was detected'))return{key:'WHATSAPP_WITHOUT_BOOKING',sourceEvidence:evidence,english:'WhatsApp is available as a verified contact channel, but your website does not appear to have a clear booking flow',arabic:'واتساب متوفر عندكم كوسيلة تواصل متحققة، لكن ما ظهر في الموقع مسار واضح للحجز'};
  return null;
}
export function buildMessagePlan(input:MessagePlanInput){
  const locale=getLocaleProfile(input.marketCode);const bilingual=GULF_MARKETS.has(input.marketCode);const single=chooseLanguage({marketCode:input.marketCode,detectedLanguage:input.detectedLanguage,preferredLanguage:input.preferredLanguage});const languages=bilingual?['en',locale.primaryLocale]:[single];const evidence=input.evidence.filter(Boolean).slice(0,3);if(!evidence.length)throw new Error('At least one verified business-specific observation is required');
  return{businessName:input.businessName,industry:input.industry,recipientRole:input.recipientRole,language:bilingual?`en+${locale.primaryLocale}`:single,languages,languageMode:bilingual?'BILINGUAL_FIRST_TOUCH' as const:'SINGLE_LANGUAGE' as const,dialect:locale.dialect,tone:locale.tone,dialectIntensity:locale.dialectIntensity,maxWords:locale.maxFirstTouchWords,maxWordsPerLanguage:bilingual?Math.max(20,Math.floor(locale.maxFirstTouchWords/2)):locale.maxFirstTouchWords,evidence,recommendedOffer:input.recommendedOffer,structure:bilingual?['english_personal_observation_and_relevant_value','localized_arabic_equivalent_with_same_facts','one_shared_low_pressure_cta']:['personal_observation','one_relevant_problem_or_opportunity','one_relevant_solution','one_short_benefit','low_pressure_cta'],compositionRules:bilingual?['English section first, localized Gulf Arabic section second.','Both sections must communicate the same verified facts and offer.','Keep both sections concise and low pressure.','After a reply, mirror the customer language.']:['Use the planned single language and market tone.'],forbidden:['generic agency brochure','invented facts','unverified claims','guaranteed results','irrelevant upsells','forced heavy dialect']};
}
export function buildCanonicalFirstTouchDraft(input:MessagePlanInput){
  const observation=input.evidence.filter(Boolean).map(canonicalObservation).find((x):x is CanonicalFirstTouchObservation=>x!==null);if(!observation)throw new Error('No supported verified first-touch observation is available');const offer=CANONICAL_OFFER_COPY[input.recommendedOffer];if(!offer)throw new Error('Recommended offer has no canonical first-touch copy');const businessName=input.businessName.trim();if(!businessName)throw new Error('businessName is required');const prioritized=[observation.sourceEvidence,...input.evidence.filter(x=>x&&x!==observation.sourceEvidence)];const plan=buildMessagePlan({...input,evidence:prioritized});const english=`Hi ${businessName}, I noticed ${observation.english}. Based on that, ${offer.english} could be useful. Would it help if I sent you a short outline?`;
  let sections:CanonicalFirstTouchSections={english};let text=english;
  if(GULF_MARKETS.has(input.marketCode)){const arabic=`هلا ${businessName}، لاحظنا إن ${observation.arabic}. وبناءً على هالمعلومة، ممكن نساعدكم من خلال ${offer.arabic}. إذا حابين، نرسل لكم ملخص قصير؟`;sections={english,arabic,omaniArabic:arabic};text=`${english}\n\n${arabic}`;}
  return{plan,observation,offer,sections,text,subject:`A quick idea for ${businessName}`};
}

type OmanFirstTouchDraft = Omit<ReturnType<typeof buildCanonicalFirstTouchDraft>, 'sections'> & {
  sections: { english:string; arabic:string; omaniArabic:string };
};

export function buildOmanFirstTouchDraft(input:MessagePlanInput):OmanFirstTouchDraft{
  if(input.marketCode!=='OM')throw new Error('Canonical Oman first-touch rendering is only available for market OM');
  const draft=buildCanonicalFirstTouchDraft(input);
  if(!draft.sections.arabic||!draft.sections.omaniArabic)throw new Error('Canonical Oman first-touch Arabic section is unavailable');
  return{...draft,sections:{english:draft.sections.english,arabic:draft.sections.arabic,omaniArabic:draft.sections.omaniArabic}};
}