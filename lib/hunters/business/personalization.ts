import type { DiscoveredBusiness } from './types';

export type PersonalizationRegion = 'MUSCAT_LOCAL' | 'OMAN_REMOTE' | 'INTERNATIONAL_REMOTE';
export type WebsitePresenceClass = 'NONE' | 'CONTACT_ONLY' | 'STANDALONE';
export type IndustrySegment = 'DENTAL' | 'BEAUTY' | 'RESTAURANT' | 'SALON' | 'VET' | 'CLINIC' | 'GENERIC';
export type CheapestNextAction = 'SKIP' | 'CONTACT_READY' | 'SOCIAL_CHECK' | 'WEBSITE_EVIDENCE' | 'EVIDENCE_READY' | 'CATALOG_SETUP';

const INDUSTRY_RULES: Array<{ segment: IndustrySegment; needles: string[]; angle: string }> = [
  { segment: 'DENTAL', needles: ['dental','dentist','orthodont','teeth','oral','اسنان','أسنان'], angle: 'trust, bookings, before/after proof and local patient acquisition' },
  { segment: 'VET', needles: ['veterinary','veterinar','pet clinic','animal clinic','vet ','بيطري','حيوانات'], angle: 'trust, appointments, pet-owner education and local recurring care' },
  { segment: 'BEAUTY', needles: ['beauty','aesthetic','cosmetic','laser','skin clinic','medspa','spa','تجميل','ليزر'], angle: 'visual proof, transformations, booking conversion and premium positioning' },
  { segment: 'SALON', needles: ['salon','barber','hair','nails','lash','brow','صالون','حلاق'], angle: 'reels, transformations, booking calls-to-action and repeat visits' },
  { segment: 'RESTAURANT', needles: ['restaurant','cafe','coffee','bakery','food','مطعم','مقهى','كافيه'], angle: 'menu discovery, reels, offers, maps traffic and reservations' },
  { segment: 'CLINIC', needles: ['clinic','medical','health center','polyclinic','عيادة','مركز صحي'], angle: 'trust, service clarity, appointment conversion and local discovery' },
];

const MARKET_LABELS: Record<string,string> = { OM:'Oman', AE:'UAE', SA:'Saudi Arabia', QA:'Qatar', GB:'UK', UK:'UK', US:'USA' };
const HIGH_VALUE_WEBSITE_SEGMENTS = new Set<IndustrySegment>(['DENTAL','CLINIC','VET']);

function clean(value: string | null | undefined) { return String(value ?? '').trim(); }
function lower(value: string | null | undefined) { return clean(value).toLowerCase(); }
function clamp(value:number){return Math.max(0,Math.min(100,Math.round(value)));}

export function inferIndustrySegment(business: Pick<DiscoveredBusiness,'name'|'category'|'primaryTypeDisplayName'>): IndustrySegment {
  const haystack = `${lower(business.name)} ${lower(business.category)} ${lower(business.primaryTypeDisplayName)}`;
  return INDUSTRY_RULES.find(rule=>rule.needles.some(needle=>haystack.includes(needle)))?.segment ?? 'GENERIC';
}

function premiumRestaurantWebsiteSignal(business: DiscoveredBusiness, segment: IndustrySegment, reviewCount: number, rating: number) {
  if (segment !== 'RESTAURANT') return false;
  const priceLevel = String(business.priceLevel ?? '').toUpperCase();
  return priceLevel.includes('EXPENSIVE') || priceLevel.includes('HIGH') || (reviewCount >= 100 && rating >= 4.2);
}

export function buildZeroCostPersonalization(
  business: DiscoveredBusiness,
  region: PersonalizationRegion,
  websiteClass: WebsitePresenceClass,
) {
  const operational = String(business.businessStatus ?? '').toUpperCase() === 'OPERATIONAL';
  const segment = inferIndustrySegment(business);
  const hasPhone = Boolean(clean(business.internationalPhone) || clean(business.phone));
  const hasWhatsapp = Boolean(clean(business.whatsapp));
  const hasMaps = Boolean(clean(business.googleMapsUri));
  const hasAddress = Boolean(clean(business.formattedAddress));
  const hasInstagram = Boolean(clean(business.instagram));
  const reviewCount = Math.max(0, Number(business.userRatingCount ?? 0));
  const rating = Math.max(0, Number(business.rating ?? 0));
  const market = MARKET_LABELS[String(business.countryCode ?? '').toUpperCase()] ?? String(business.countryCode ?? 'Unknown market').toUpperCase();
  const industryRule = INDUSTRY_RULES.find(rule=>rule.segment===segment);
  const websiteHypothesisStrong = HIGH_VALUE_WEBSITE_SEGMENTS.has(segment) || premiumRestaurantWebsiteSignal(business, segment, reviewCount, rating);

  const contactabilityScore = clamp((hasPhone?55:0)+(hasWhatsapp?25:0)+(hasMaps?10:0)+(hasAddress?10:0));
  const needScore = operational ? clamp((websiteClass==='NONE'?75:websiteClass==='CONTACT_ONLY'?68:20)+(region==='MUSCAT_LOCAL'?10:5)+(segment!=='GENERIC'?10:0)) : 0;
  const serviceFitScore = operational ? clamp(35+(segment!=='GENERIC'?25:10)+(region==='MUSCAT_LOCAL'?20:15)+(hasPhone?15:0)+(websiteClass!=='STANDALONE'?10:0)) : 0;
  const revenuePotentialScore = operational ? clamp(35+(reviewCount>=100?25:reviewCount>=20?15:reviewCount>0?8:0)+(rating>=4?10:0)+(['AE','SA','QA','GB','UK','US'].includes(String(business.countryCode??'').toUpperCase())?15:8)+(segment!=='GENERIC'?10:0)) : 0;
  const personalizationPriorityScore = operational
    ? clamp(contactabilityScore*0.35 + needScore*0.25 + serviceFitScore*0.25 + revenuePotentialScore*0.15)
    : 0;

  const fingerprint = [
    segment,
    market,
    clean(business.city)||'CITY_UNKNOWN',
    region,
    websiteClass==='STANDALONE'?'HAS_STANDALONE_WEBSITE':'NO_STANDALONE_WEBSITE',
    hasPhone?'PHONE_READY':'PHONE_MISSING',
    hasWhatsapp?'WHATSAPP_LINK_KNOWN':'WHATSAPP_CANDIDATE_OR_UNKNOWN',
    hasInstagram?'INSTAGRAM_KNOWN':'SOCIAL_UNKNOWN',
  ];

  const offerBundle:string[]=[];
  if(websiteClass!=='STANDALONE' && websiteHypothesisStrong)offerBundle.push('WEBSITE');
  if(region==='MUSCAT_LOCAL')offerBundle.push('ON_SITE_CONTENT','REELS');
  else offerBundle.push('AI_CONTENT','AI_REELS');
  if(segment==='RESTAURANT'||segment==='BEAUTY'||segment==='SALON'||segment==='DENTAL'||segment==='VET')offerBundle.push('ADS_CREATIVES');

  const messageHooks:string[]=[];
  if(websiteClass==='NONE')messageHooks.push('No standalone website is currently known; this is evidence to evaluate, not automatically a website-sales conclusion.');
  else if(websiteClass==='CONTACT_ONLY')messageHooks.push('The known web presence is a directory/social/contact page rather than a standalone website; service fit still needs evidence.');
  if(region==='MUSCAT_LOCAL')messageHooks.push(`The business is in ${clean(business.city)||'Muscat'}, where on-site filming is serviceable.`);
  else messageHooks.push('Remote website and AI-content delivery is serviceable without on-site filming.');
  if(hasPhone)messageHooks.push('A direct phone contact path is available.');
  if(hasInstagram)messageHooks.push('An Instagram profile is already known, but content quality is not assumed.');
  if(reviewCount>0)messageHooks.push(`Existing Google activity is visible (${reviewCount} rating${reviewCount===1?'':'s'}).`);
  messageHooks.push('Social-content quality is not claimed until evidence is checked.');

  const recommendedAngle = industryRule?.angle ?? 'clear digital presence, direct response and practical growth improvements';
  const socialCheckEligible = operational && contactabilityScore>=50 && serviceFitScore>=60 && personalizationPriorityScore>=60;

  let cheapestNextAction: CheapestNextAction = 'SKIP';
  let nextActionReason = 'Not enough verified value to spend or contact yet.';
  let nextActionCanSpendMoney = false;
  if (operational && contactabilityScore >= 55 && websiteClass !== 'STANDALONE' && personalizationPriorityScore >= 65 && websiteHypothesisStrong) {
    cheapestNextAction = 'CONTACT_READY';
    nextActionReason = 'Industry/scale evidence plus the missing standalone website supports a website hypothesis; the missing website alone is not sufficient.';
  } else if (socialCheckEligible && hasInstagram) {
    cheapestNextAction = 'SOCIAL_CHECK';
    nextActionReason = 'A known Instagram presence and strong content fit make a controlled social check useful before AI is used.';
    nextActionCanSpendMoney = true;
  } else if (operational && websiteClass === 'STANDALONE' && contactabilityScore >= 50 && serviceFitScore >= 55) {
    cheapestNextAction = 'WEBSITE_EVIDENCE';
    nextActionReason = 'A standalone website exists; the existing deterministic website audit can add useful evidence before any paid social or AI step.';
    nextActionCanSpendMoney = false;
  }

  return {
    segment,
    market,
    contactabilityScore,
    needScore,
    serviceFitScore,
    revenuePotentialScore,
    personalizationPriorityScore,
    fingerprint,
    offerBundle:[...new Set(offerBundle)],
    recommendedAngle,
    messageHooks,
    socialCheckEligible,
    cheapestNextAction,
    nextActionReason,
    nextActionCanSpendMoney,
    providerCalls:0,
    llmCalls:0,
    estimatedApiCostUsd:0,
  };
}
