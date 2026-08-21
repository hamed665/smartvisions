export type BusinessDiscoveryQuery = { countryCode: string; city: string; industry: string; limit: number };

export type GoogleReview = {
  name?: string;
  rating?: number;
  text?: string;
  relativePublishTimeDescription?: string;
  publishTime?: string;
  authorName?: string;
  authorUri?: string;
  authorPhotoUri?: string;
};

export type OpeningHours = { openNow?: boolean; weekdayDescriptions?: string[] };

export type DiscoveredBusiness = {
  sourceType: 'google_places' | 'manual' | 'other'; sourceId?: string; name: string; countryCode: string; city?: string; category?: string; googlePlaceId?: string;
  officialWebsite?: string; phone?: string; internationalPhone?: string; email?: string; instagram?: string; whatsapp?: string; sourceUrl?: string; retrievedAt: string;
  formattedAddress?: string; googleMapsUri?: string; rating?: number; userRatingCount?: number; businessStatus?: string; primaryTypeDisplayName?: string;
  openingHours?: OpeningHours; reviews?: GoogleReview[]; reviewSummary?: string; priceLevel?: string;
};

export interface BusinessDiscoveryProvider { discover(query: BusinessDiscoveryQuery): Promise<DiscoveredBusiness[]>; }
