import type { DiscoveredBusiness } from './types';
import { classifyWebsiteUri, deriveWhatsappCandidate } from './selective-enrichment';

export type GrowthServiceRegion = 'MUSCAT_LOCAL' | 'OMAN_REMOTE' | 'INTERNATIONAL_REMOTE';
export type GrowthLane = 'MUSCAT_LOCAL_GROWTH' | 'OMAN_REMOTE_GROWTH' | 'INTERNATIONAL_AI_GROWTH';
export type ContentCheckStatus = 'NOT_ELIGIBLE' | 'PENDING_SOCIAL_CHECK' | 'READY_FOR_REVIEW';

const MUSCAT_HINTS = [
  'muscat','masqat','مسقط','bosher','bawshar','بوشر','azaiba','al azaiba','العذيبة','khuwair','الخوير','qurum','القرم','seeb','السيب','muttrah','matrah','مطرح','amerat','al amerat','العامرات','ghubra','الغبرة','mawaleh','الموالح','hail','الحيل','madinat al sultan qaboos','mq',
];

function text(value: string | null | undefined) { return String(value ?? '').trim().toLowerCase(); }

export function classifyServiceRegion(countryCode: string | null | undefined, city: string | null | undefined): GrowthServiceRegion {
  const country = text(countryCode).toUpperCase();
  const location = text(city);
  if (country !== 'OM') return 'INTERNATIONAL_REMOTE';
  if (MUSCAT_HINTS.some((hint) => location.includes(hint))) return 'MUSCAT_LOCAL';
  return 'OMAN_REMOTE';
}

export function buildGrowthOpportunity(business: DiscoveredBusiness) {
  const operational = String(business.businessStatus ?? '').toUpperCase() === 'OPERATIONAL';
  const websiteClass = classifyWebsiteUri(business.officialWebsite);
  const region = classifyServiceRegion(business.countryCode, business.city);
  const contactable = Boolean(business.phone || business.internationalPhone || business.whatsapp || deriveWhatsappCandidate(business.internationalPhone, business.phone, business.countryCode));
  const reviewCount = Math.max(0, Number(business.userRatingCount ?? 0));
  const rating = Math.max(0, Number(business.rating ?? 0));

  let websiteScore = 0;
  if (operational && websiteClass === 'NONE') websiteScore = 95;
  else if (operational && websiteClass === 'CONTACT_ONLY') websiteScore = 88;
  else if (operational && websiteClass === 'STANDALONE') websiteScore = 15;
  if (contactable && websiteScore > 0) websiteScore = Math.min(100, websiteScore + 5);

  let localContentScore = 0;
  let aiContentScore = 0;
  if (operational && region === 'MUSCAT_LOCAL') {
    localContentScore = 55 + (contactable ? 10 : 0) + (websiteClass !== 'STANDALONE' ? 10 : 0) + (reviewCount >= 20 ? 5 : 0) + (rating >= 4 ? 5 : 0);
    aiContentScore = 35 + (contactable ? 10 : 0);
  } else if (operational) {
    aiContentScore = 55 + (contactable ? 10 : 0) + (websiteClass !== 'STANDALONE' ? 10 : 0) + (reviewCount >= 20 ? 5 : 0) + (rating >= 4 ? 5 : 0);
  }

  websiteScore = Math.min(100, websiteScore);
  localContentScore = Math.min(100, localContentScore);
  aiContentScore = Math.min(100, aiContentScore);
  const overallSalesScore = Math.max(websiteScore, localContentScore, aiContentScore);

  const lane: GrowthLane = region === 'MUSCAT_LOCAL' ? 'MUSCAT_LOCAL_GROWTH' : region === 'OMAN_REMOTE' ? 'OMAN_REMOTE_GROWTH' : 'INTERNATIONAL_AI_GROWTH';
  const recommendedServices: string[] = [];
  if (websiteScore >= 70) recommendedServices.push('WEBSITE');
  if (localContentScore >= 50) recommendedServices.push('ON_SITE_CONTENT','REELS','PHOTOGRAPHY');
  if (aiContentScore >= 50) recommendedServices.push('AI_CONTENT','AI_REELS','CREATIVE_PACK');
  if (overallSalesScore >= 70) recommendedServices.push('ADS_CREATIVES');

  const reasons: string[] = [];
  if (!operational) reasons.push('Business is not confirmed operational');
  else reasons.push('Google marks the business as operational');
  if (websiteClass === 'NONE') reasons.push('No website returned by Google');
  if (websiteClass === 'CONTACT_ONLY') reasons.push('Only social/contact link present; no standalone website');
  if (region === 'MUSCAT_LOCAL') reasons.push('Muscat-local: on-site filming and content production are serviceable');
  if (region === 'OMAN_REMOTE') reasons.push('Outside Muscat: route to website + remote AI content');
  if (region === 'INTERNATIONAL_REMOTE') reasons.push('International: route to website + remote AI content');
  if (contactable) reasons.push('Direct contact path is available');

  const contentCheckStatus: ContentCheckStatus = operational ? 'PENDING_SOCIAL_CHECK' : 'NOT_ELIGIBLE';
  return { region, lane, websiteClass, websiteScore, localContentScore, aiContentScore, overallSalesScore, contentCheckStatus, recommendedServices: [...new Set(recommendedServices)], reasons };
}
