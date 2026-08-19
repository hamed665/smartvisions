export type IntentSource = 'freelancer' | 'upwork_alert' | 'peopleperhour_alert' | 'public_post' | 'inbound' | 'manual';

export type IntentOpportunity = {
  sourceType: IntentSource;
  sourceId?: string;
  sourceUrl?: string;
  title?: string;
  body: string;
  language?: string;
  countryCode?: string;
  serviceHint?: string;
  budgetAmount?: number;
  budgetCurrency?: string;
  postedAt?: string;
  detectedAt: string;
  contactMethodAvailable?: boolean;
  businessIdentifiable?: boolean;
  alreadyFilled?: boolean;
};

export interface IntentDiscoveryProvider {
  discover(): Promise<IntentOpportunity[]>;
}
