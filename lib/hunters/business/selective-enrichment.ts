import { normalizeDomain } from './dedupe';
import type { DiscoveredBusiness } from './types';

const GOOGLE_PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{10,220}$/;
const CONTACT_ONLY_HOSTS = new Set([
  'wa.me','www.wa.me','api.whatsapp.com','whatsapp.com','www.whatsapp.com',
  'instagram.com','www.instagram.com','facebook.com','www.facebook.com','m.facebook.com',
  'linktr.ee','www.linktr.ee','bio.site','taplink.cc',
  'whatclinic.com','www.whatclinic.com','fresha.com','www.fresha.com','booksy.com','www.booksy.com',
  'linkin.bio','www.linkin.bio','beacons.ai','www.beacons.ai',
]);

export function assertValidGooglePlaceId(placeId: string) {
  if (!GOOGLE_PLACE_ID_PATTERN.test(placeId)) throw new Error('Invalid Google Place ID');
  return placeId;
}

export function classifyWebsiteUri(value: string | null | undefined): 'NONE' | 'CONTACT_ONLY' | 'STANDALONE' {
  const raw = String(value ?? '').trim();
  if (!raw) return 'NONE';
  try {
    const url = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
    return CONTACT_ONLY_HOSTS.has(url.hostname.toLowerCase()) ? 'CONTACT_ONLY' : 'STANDALONE';
  } catch {
    return 'STANDALONE';
  }
}

export function hasStandaloneWebsite(business: Pick<DiscoveredBusiness,'officialWebsite'>) {
  return classifyWebsiteUri(business.officialWebsite) === 'STANDALONE';
}

export function deriveWhatsappCandidate(internationalPhone:string|null|undefined,nationalPhone?:string|null,countryCode='OM') {
  const preferred = String(internationalPhone ?? '').trim() || String(nationalPhone ?? '').trim();
  if (!preferred) return undefined;
  let digits = preferred.replace(/\D/g,'');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (String(countryCode).toUpperCase() === 'OM' && digits.length === 8) digits = `968${digits}`;
  if (!/^\d{8,15}$/.test(digits)) return undefined;
  return `https://wa.me/${digits}`;
}

export function hasDirectProspectContact(business: DiscoveredBusiness) {
  return Boolean(
    String(business.phone ?? '').trim()
    || String(business.internationalPhone ?? '').trim()
    || String(business.email ?? '').trim()
    || String(business.whatsapp ?? '').trim()
    || deriveWhatsappCandidate(business.internationalPhone,business.phone,business.countryCode),
  );
}

export function isPriorityNoWebsiteBusiness(business:DiscoveredBusiness) {
  return String(business.businessStatus ?? '').toUpperCase() === 'OPERATIONAL'
    && !hasStandaloneWebsite(business)
    && hasDirectProspectContact(business);
}

export function calculateNoWebsiteOpportunityScore(business:DiscoveredBusiness) {
  let score = 0;
  const reasons:string[] = [];
  const websiteClass = classifyWebsiteUri(business.officialWebsite);
  const operational = String(business.businessStatus ?? '').toUpperCase() === 'OPERATIONAL';
  const directContact = hasDirectProspectContact(business);
  if (operational) { score += 30; reasons.push('Google marks the business as operational'); }
  if (websiteClass === 'NONE') { score += 40; reasons.push('No official website returned by Google'); }
  else if (websiteClass === 'CONTACT_ONLY') { score += 36; reasons.push('Only a social/contact/directory link is present; no official standalone website'); }
  if (business.phone || business.internationalPhone) { score += 15; reasons.push('Direct phone contact is available'); }
  if (business.whatsapp || deriveWhatsappCandidate(business.internationalPhone,business.phone,business.countryCode)) { score += 8; reasons.push('WhatsApp candidate link is available without another API call'); }
  if (business.email) { score += 6; reasons.push('Direct email contact is available'); }
  const reviewCount = Math.max(0,Number(business.userRatingCount ?? 0));
  if (reviewCount >= 100) { score += 7; reasons.push('Strong Google activity with 100+ ratings'); }
  else if (reviewCount >= 20) { score += 4; reasons.push('Established Google activity with 20+ ratings'); }
  else if (reviewCount > 0) { score += 2; reasons.push('Google ratings confirm customer activity'); }
  if (Number(business.rating ?? 0) >= 4) { score += 3; reasons.push('Google rating is 4.0 or higher'); }
  if (!directContact) { score = Math.min(score, 45); reasons.push('No direct contact path; not eligible for lead promotion'); }
  return { score: Math.min(100,score), reasons };
}

export function buildBusinessPersistenceRow(organizationId:string,business:DiscoveredBusiness) {
  const whatsapp = business.whatsapp
    ?? (classifyWebsiteUri(business.officialWebsite) === 'CONTACT_ONLY' && /(?:wa\.me|whatsapp\.com)/i.test(String(business.officialWebsite ?? ''))
      ? business.officialWebsite
      : deriveWhatsappCandidate(business.internationalPhone,business.phone,business.countryCode));
  return {
    organization_id:organizationId,name:business.name,country_code:business.countryCode,city:business.city??null,category:business.category??null,
    google_place_id:business.googlePlaceId??null,official_website:business.officialWebsite??null,phone:business.phone??null,
    international_phone:business.internationalPhone??null,email:business.email??null,instagram:business.instagram??null,whatsapp:whatsapp??null,
    dedupe_domain:hasStandaloneWebsite(business)?normalizeDomain(business.officialWebsite)??null:null,formatted_address:business.formattedAddress??null,
    google_maps_uri:business.googleMapsUri??null,google_rating:business.rating??null,google_user_rating_count:business.userRatingCount??null,
    google_business_status:business.businessStatus??null,google_price_level:business.priceLevel??null,
    google_primary_type_display_name:business.primaryTypeDisplayName??null,google_opening_hours:business.openingHours??{},google_reviews:business.reviews??[],
    google_review_summary:business.reviewSummary??null,google_intelligence_retrieved_at:business.retrievedAt,updated_at:new Date().toISOString(),
  };
}

export function buildLeadPersistenceRow(organizationId:string,businessId:string,business:DiscoveredBusiness) {
  if (!isPriorityNoWebsiteBusiness(business)) throw new Error('Low-confidence business cannot be promoted as a no-website Lead');
  const {score,reasons} = calculateNoWebsiteOpportunityScore(business);
  return {
    organization_id:organizationId,
    business_id:businessId,
    status:'NEW' as const,
    opportunity_score:score,
    intent_score:0,
    agent_mode:'AUTO' as const,
    recommended_offer:'business_website',
    score_reasons:reasons,
    updated_at:new Date().toISOString(),
  };
}
