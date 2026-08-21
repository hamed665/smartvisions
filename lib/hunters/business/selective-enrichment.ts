import { normalizeDomain } from './dedupe';
import type { DiscoveredBusiness } from './types';

const GOOGLE_PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{10,220}$/;

export function assertValidGooglePlaceId(placeId: string) {
  if (!GOOGLE_PLACE_ID_PATTERN.test(placeId)) throw new Error('Invalid Google Place ID');
  return placeId;
}

export function isPriorityNoWebsiteBusiness(business: DiscoveredBusiness) {
  return String(business.businessStatus ?? '').toUpperCase() === 'OPERATIONAL'
    && !String(business.officialWebsite ?? '').trim();
}

export function calculateNoWebsiteOpportunityScore(business: DiscoveredBusiness) {
  let score = 0;
  const reasons: string[] = [];

  if (String(business.businessStatus ?? '').toUpperCase() === 'OPERATIONAL') {
    score += 35;
    reasons.push('Google marks the business as operational');
  }
  if (!String(business.officialWebsite ?? '').trim()) {
    score += 40;
    reasons.push('No official website returned by Google');
  }
  if (business.phone || business.internationalPhone) {
    score += 10;
    reasons.push('Direct phone contact is available');
  }
  const reviewCount = Math.max(0, Number(business.userRatingCount ?? 0));
  if (reviewCount >= 100) {
    score += 10;
    reasons.push('Strong Google activity with 100+ ratings');
  } else if (reviewCount >= 20) {
    score += 6;
    reasons.push('Established Google activity with 20+ ratings');
  } else if (reviewCount > 0) {
    score += 3;
    reasons.push('Google ratings confirm recent customer activity');
  }
  if (Number(business.rating ?? 0) >= 4) {
    score += 5;
    reasons.push('Google rating is 4.0 or higher');
  }

  return { score: Math.min(100, score), reasons };
}

export function buildBusinessPersistenceRow(organizationId: string, business: DiscoveredBusiness) {
  return {
    organization_id: organizationId,
    name: business.name,
    country_code: business.countryCode,
    city: business.city ?? null,
    category: business.category ?? null,
    google_place_id: business.googlePlaceId ?? null,
    official_website: business.officialWebsite ?? null,
    phone: business.phone ?? null,
    international_phone: business.internationalPhone ?? null,
    email: business.email ?? null,
    instagram: business.instagram ?? null,
    whatsapp: business.whatsapp ?? null,
    dedupe_domain: normalizeDomain(business.officialWebsite) ?? null,
    formatted_address: business.formattedAddress ?? null,
    google_maps_uri: business.googleMapsUri ?? null,
    google_rating: business.rating ?? null,
    google_user_rating_count: business.userRatingCount ?? null,
    google_business_status: business.businessStatus ?? null,
    google_price_level: business.priceLevel ?? null,
    google_primary_type_display_name: business.primaryTypeDisplayName ?? null,
    google_opening_hours: business.openingHours ?? {},
    google_reviews: business.reviews ?? [],
    google_review_summary: business.reviewSummary ?? null,
    google_intelligence_retrieved_at: business.retrievedAt,
    updated_at: new Date().toISOString(),
  };
}

export function buildLeadPersistenceRow(
  organizationId: string,
  businessId: string,
  business: DiscoveredBusiness,
) {
  const { score, reasons } = calculateNoWebsiteOpportunityScore(business);
  return {
    organization_id: organizationId,
    business_id: businessId,
    status: 'NEW' as const,
    opportunity_score: score,
    intent_score: 0,
    agent_mode: 'AUTO' as const,
    score_reasons: reasons,
    updated_at: new Date().toISOString(),
  };
}
