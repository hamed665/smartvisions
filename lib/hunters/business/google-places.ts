import type { BusinessDiscoveryQuery, DiscoveredBusiness } from './types';

type TextSearchResponse = {
  places?: Array<{ id?: string }>;
};

type PlaceDetails = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  primaryType?: string;
};

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
    const payload = (await response.json()) as TextSearchResponse;
    return (payload.places ?? []).map((place) => place.id).filter((id): id is string => Boolean(id));
  }

  async getBusiness(placeId: string, fallback: Pick<BusinessDiscoveryQuery, 'countryCode' | 'city'>): Promise<DiscoveredBusiness> {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,websiteUri,nationalPhoneNumber,primaryType',
      },
    });

    if (!response.ok) throw new Error(`Google Place Details failed: ${response.status}`);
    const place = (await response.json()) as PlaceDetails;

    return {
      sourceType: 'google_places',
      sourceId: place.id ?? placeId,
      googlePlaceId: place.id ?? placeId,
      name: place.displayName?.text ?? placeId,
      countryCode: fallback.countryCode,
      city: fallback.city,
      category: place.primaryType,
      officialWebsite: place.websiteUri,
      phone: place.nationalPhoneNumber,
      sourceUrl: `https://places.googleapis.com/v1/places/${place.id ?? placeId}`,
      retrievedAt: new Date().toISOString(),
    };
  }
}
