import {
  GOOGLE_BUSINESS_INTELLIGENCE_FIELD_MASK,
  GOOGLE_PRIORITY_QUALIFICATION_FIELD_MASK,
  GooglePlacesClient,
} from './google-places';
import type { BusinessDiscoveryQuery, DiscoveredBusiness } from './types';
import {
  assertPaidOperationAllowed,
  getCostGuardState,
  recordUsage,
  type CostGuardState,
} from '@/lib/reliability/cost-guard';
import { assertRuntimeOperationAllowed } from '@/lib/reliability/runtime-safety';

export const GOOGLE_PLACES_ID_SEARCH_ESTIMATED_COST_USD = 0;
// Current global list price beyond the free monthly cap is $20 / 1,000 for
// Place Details Enterprise and $25 / 1,000 for Enterprise + Atmosphere.
// These are conservative budget reserves, not a claim about the final bill.
export const GOOGLE_PLACES_QUALIFICATION_BUDGET_RESERVE_USD = 0.02;
export const GOOGLE_PLACES_DETAILS_BUDGET_RESERVE_USD = 0.025;

export function assertGooglePlacesProviderBudget(state: CostGuardState, estimatedCostUsd: number) {
  const budget = Math.max(0, Number(state.settings.google_places_budget_usd ?? 0));
  const spent = Math.max(0, Number(state.providerSpendUsd.GOOGLE_PLACES ?? 0));
  if (budget <= 0) throw new Error('Google Places provider budget is disabled');
  if (spent + Math.max(0, estimatedCostUsd) > budget) throw new Error('Google Places provider budget would be exceeded');
}

async function preflight(
  organizationId: string,
  estimatedCostUsd: number,
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' = 'LOW',
) {
  await assertRuntimeOperationAllowed(organizationId, 'DISCOVERY');
  const state = await getCostGuardState(organizationId);
  if (!state) throw new Error('Cost Guard state is unavailable; Google Places request blocked');
  assertPaidOperationAllowed(state, priority);
  assertGooglePlacesProviderBudget(state, estimatedCostUsd);
  return state;
}

function client() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not configured');
  return new GooglePlacesClient(apiKey);
}

export async function controlledGooglePlacesIdSearch(input: {
  organizationId: string;
  query: BusinessDiscoveryQuery;
}) {
  await preflight(input.organizationId, 0, 'LOW');
  const startedAt = Date.now();
  const placeIds = await client().discoverPlaceIds(input.query);
  const latencyMs = Date.now() - startedAt;
  await recordUsage({
    organizationId: input.organizationId,
    provider: 'GOOGLE_PLACES',
    operation: 'TEXT_SEARCH_IDS_ONLY',
    costUsd: 0,
    units: 1,
    metadata: {
      sku: 'Places API Text Search Essentials (IDs Only)',
      countryCode: input.query.countryCode,
      city: input.query.city,
      industry: input.query.industry,
      requestedLimit: input.query.limit,
      returnedCount: placeIds.length,
      latencyMs,
    },
  });
  return { placeIds, latencyMs };
}

export async function controlledGooglePlaceQualification(input: {
  organizationId: string;
  placeId: string;
  countryCode: string;
  city: string;
}): Promise<DiscoveredBusiness> {
  await preflight(input.organizationId, GOOGLE_PLACES_QUALIFICATION_BUDGET_RESERVE_USD, 'LOW');
  const startedAt = Date.now();
  const business = await client().getPriorityQualification(input.placeId, {
    countryCode: input.countryCode,
    city: input.city,
  });
  const latencyMs = Date.now() - startedAt;
  await recordUsage({
    organizationId: input.organizationId,
    provider: 'GOOGLE_PLACES',
    operation: 'PLACE_DETAILS_PRIORITY_QUALIFICATION',
    costUsd: GOOGLE_PLACES_QUALIFICATION_BUDGET_RESERVE_USD,
    units: 1,
    metadata: {
      sku: 'Places API Place Details Enterprise',
      purpose: 'operational + website qualification; reviews deliberately excluded',
      placeId: input.placeId,
      latencyMs,
      fieldMask: GOOGLE_PRIORITY_QUALIFICATION_FIELD_MASK,
      hasWebsite: Boolean(business.officialWebsite),
      businessStatus: business.businessStatus ?? null,
    },
  });
  return business;
}

export async function controlledGooglePlaceDetails(input: {
  organizationId: string;
  placeId: string;
  countryCode: string;
  city: string;
}): Promise<DiscoveredBusiness> {
  await preflight(input.organizationId, GOOGLE_PLACES_DETAILS_BUDGET_RESERVE_USD, 'NORMAL');
  const startedAt = Date.now();
  const business = await client().getBusiness(input.placeId, {
    countryCode: input.countryCode,
    city: input.city,
  });
  const latencyMs = Date.now() - startedAt;
  await recordUsage({
    organizationId: input.organizationId,
    provider: 'GOOGLE_PLACES',
    operation: 'PLACE_DETAILS_BUSINESS_INTELLIGENCE',
    costUsd: GOOGLE_PLACES_DETAILS_BUDGET_RESERVE_USD,
    units: 1,
    metadata: {
      sku: 'Places API Place Details Enterprise + Atmosphere',
      purpose: 'explicit full intelligence only; includes review subset',
      placeId: input.placeId,
      latencyMs,
      fieldMask: GOOGLE_BUSINESS_INTELLIGENCE_FIELD_MASK,
      reviewCountReturned: business.reviews?.length ?? 0,
      rating: business.rating ?? null,
      userRatingCount: business.userRatingCount ?? null,
    },
  });
  return business;
}
