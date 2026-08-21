import type { BusinessDiscoveryQuery, DiscoveredBusiness, GoogleReview } from './types';

type TextSearchResponse = { places?: Array<{ id?: string }> };
type PlaceDetails = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  priceLevel?: string;
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  reviews?: Array<{
    name?: string;
    rating?: number;
    text?: { text?: string };
    relativePublishTimeDescription?: string;
    publishTime?: string;
    authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  }>;
  reviewSummary?: { text?: { text?: string } };
};

// Website URI already triggers Place Details Enterprise. Keep first-pass qualification
// below Enterprise+Atmosphere by excluding reviews/reviewSummary. Every returned field
// is useful for deciding whether a business is an actionable no-website lead.
export const GOOGLE_PRIORITY_QUALIFICATION_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'websiteUri',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'primaryType',
  'primaryTypeDisplayName',
  'googleMapsUri',
  'rating',
  'userRatingCount',
  'businessStatus',
  'regularOpeningHours',
].join(',');

export const GOOGLE_BUSINESS_INTELLIGENCE_FIELD_MASK = [
  GOOGLE_PRIORITY_QUALIFICATION_FIELD_MASK,
  'reviews',
  'reviewSummary',
  'priceLevel',
].join(',');

function toBusiness(
  placeId: string,
  fallback: Pick<BusinessDiscoveryQuery, 'countryCode' | 'city'>,
  place: PlaceDetails,
): DiscoveredBusiness {
  const reviews: GoogleReview[] = (place.reviews ?? []).map((review) => ({
    name: review.name,
    rating: review.rating,
    text: review.text?.text,
    relativePublishTimeDescription: review.relativePublishTimeDescription,
    publishTime: review.publishTime,
    authorName: review.authorAttribution?.displayName,
    authorUri: review.authorAttribution?.uri,
    authorPhotoUri: review.authorAttribution?.photoUri,
  }));

  return {
    sourceType: 'google_places',
    sourceId: place.id ?? placeId,
    googlePlaceId: place.id ?? placeId,
    name: place.displayName?.text ?? placeId,
    countryCode: fallback.countryCode,
    city: fallback.city,
    category: place.primaryType,
    primaryTypeDisplayName: place.primaryTypeDisplayName?.text,
    officialWebsite: place.websiteUri,
    phone: place.nationalPhoneNumber,
    internationalPhone: place.internationalPhoneNumber,
    formattedAddress: place.formattedAddress,
    googleMapsUri: place.googleMapsUri,
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    businessStatus: place.businessStatus,
    priceLevel: place.priceLevel,
    openingHours: place.regularOpeningHours,
    reviews,
    reviewSummary: place.reviewSummary?.text?.text,
    sourceUrl: `https://places.googleapis.com/v1/places/${place.id ?? placeId}`,
    retrievedAt: new Date().toISOString(),
  };
}

export class GooglePlacesClient {
  constructor(private readonly apiKey: string) {}

  async discoverPlaceIds(query: BusinessDiscoveryQuery) {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': 'places.id',
      },
      body: JSON.stringify({
        textQuery: `${query.industry} in ${query.city}, ${query.countryCode}`,
        pageSize: Math.min(query.limit, 20),
      }),
    });
    if (!response.ok) throw new Error(`Google Places search failed: ${response.status}`);
    const payload = await response.json() as TextSearchResponse;
    return (payload.places ?? []).map((place) => place.id).filter((id): id is string => Boolean(id));
  }

  private async getPlace(
    placeId: string,
    fallback: Pick<BusinessDiscoveryQuery, 'countryCode' | 'city'>,
    fieldMask: string,
  ): Promise<DiscoveredBusiness> {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
    });
    if (!response.ok) throw new Error(`Google Place Details failed: ${response.status}`);
    return toBusiness(placeId, fallback, await response.json() as PlaceDetails);
  }

  async getPriorityQualification(
    placeId: string,
    fallback: Pick<BusinessDiscoveryQuery, 'countryCode' | 'city'>,
  ): Promise<DiscoveredBusiness> {
    return this.getPlace(placeId, fallback, GOOGLE_PRIORITY_QUALIFICATION_FIELD_MASK);
  }

  async getBusiness(
    placeId: string,
    fallback: Pick<BusinessDiscoveryQuery, 'countryCode' | 'city'>,
  ): Promise<DiscoveredBusiness> {
    return this.getPlace(placeId, fallback, GOOGLE_BUSINESS_INTELLIGENCE_FIELD_MASK);
  }
}
