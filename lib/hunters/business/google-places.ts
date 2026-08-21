import type { BusinessDiscoveryQuery, DiscoveredBusiness, GoogleReview } from './types';

type TextSearchResponse = { places?: Array<{ id?: string }> };
type PlaceDetails = {
  id?: string; displayName?: { text?: string }; formattedAddress?: string; websiteUri?: string; nationalPhoneNumber?: string; internationalPhoneNumber?: string;
  primaryType?: string; primaryTypeDisplayName?: { text?: string }; googleMapsUri?: string; rating?: number; userRatingCount?: number; businessStatus?: string; priceLevel?: string;
  regularOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  reviews?: Array<{ name?: string; rating?: number; text?: { text?: string }; relativePublishTimeDescription?: string; publishTime?: string; authorAttribution?: { displayName?: string; uri?: string; photoUri?: string } }>;
  reviewSummary?: { text?: { text?: string } };
};

export const GOOGLE_BUSINESS_INTELLIGENCE_FIELD_MASK = [
  'id','displayName','formattedAddress','websiteUri','nationalPhoneNumber','internationalPhoneNumber','primaryType','primaryTypeDisplayName','googleMapsUri','rating','userRatingCount','businessStatus','regularOpeningHours','reviews','reviewSummary','priceLevel',
].join(',');

export class GooglePlacesClient {
  constructor(private readonly apiKey: string) {}
  async discoverPlaceIds(query: BusinessDiscoveryQuery) {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': 'places.id' }, body: JSON.stringify({ textQuery: `${query.industry} in ${query.city}, ${query.countryCode}`, pageSize: Math.min(query.limit, 20) }) });
    if (!response.ok) throw new Error(`Google Places search failed: ${response.status}`); const payload = await response.json() as TextSearchResponse; return (payload.places ?? []).map(p => p.id).filter((id): id is string => Boolean(id));
  }
  async getBusiness(placeId: string, fallback: Pick<BusinessDiscoveryQuery,'countryCode'|'city'>): Promise<DiscoveredBusiness> {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': GOOGLE_BUSINESS_INTELLIGENCE_FIELD_MASK } });
    if (!response.ok) throw new Error(`Google Place Details failed: ${response.status}`); const place = await response.json() as PlaceDetails;
    const reviews: GoogleReview[] = (place.reviews ?? []).map(r => ({ name: r.name, rating: r.rating, text: r.text?.text, relativePublishTimeDescription: r.relativePublishTimeDescription, publishTime: r.publishTime, authorName: r.authorAttribution?.displayName, authorUri: r.authorAttribution?.uri, authorPhotoUri: r.authorAttribution?.photoUri }));
    return { sourceType:'google_places', sourceId:place.id ?? placeId, googlePlaceId:place.id ?? placeId, name:place.displayName?.text ?? placeId, countryCode:fallback.countryCode, city:fallback.city, category:place.primaryType, primaryTypeDisplayName:place.primaryTypeDisplayName?.text, officialWebsite:place.websiteUri, phone:place.nationalPhoneNumber, internationalPhone:place.internationalPhoneNumber, formattedAddress:place.formattedAddress, googleMapsUri:place.googleMapsUri, rating:place.rating, userRatingCount:place.userRatingCount, businessStatus:place.businessStatus, priceLevel:place.priceLevel, openingHours:place.regularOpeningHours, reviews, reviewSummary:place.reviewSummary?.text?.text, sourceUrl:`https://places.googleapis.com/v1/places/${place.id ?? placeId}`, retrievedAt:new Date().toISOString() };
  }
}
