export type BusinessDiscoveryQuery = {
  countryCode: string;
  city: string;
  industry: string;
  limit: number;
};

export type DiscoveredBusiness = {
  sourceType: 'google_places' | 'manual' | 'other';
  sourceId?: string;
  name: string;
  countryCode: string;
  city?: string;
  category?: string;
  googlePlaceId?: string;
  officialWebsite?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  whatsapp?: string;
  sourceUrl?: string;
  retrievedAt: string;
};

export interface BusinessDiscoveryProvider {
  discover(query: BusinessDiscoveryQuery): Promise<DiscoveredBusiness[]>;
}
