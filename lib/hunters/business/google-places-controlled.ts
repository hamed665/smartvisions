import { GooglePlacesClient } from './google-places';
import type { BusinessDiscoveryQuery, DiscoveredBusiness } from './types';
import { assertPaidOperationAllowed, getCostGuardState, recordUsage, type CostGuardState } from '@/lib/reliability/cost-guard';

export const GOOGLE_PLACES_ID_SEARCH_ESTIMATED_COST_USD = 0;
export const GOOGLE_PLACES_DETAILS_BUDGET_RESERVE_USD = 0.02;

export function assertGooglePlacesProviderBudget(
  state: CostGuardState,
  estimatedCostUsd: number,
) {
  const providerBudget = Math.max(0, Number(state.settings.google_places_budget_usd ?? 0));
  const spent = Math.max(0, Number(state.providerSpendUsd.GOOGLE_PLACES ?? 0));
  if (providerBudget <= 0) throw new Error('Google Places provider budget is disabled');
  if (spent + Math.max(0, estimatedCostUsd) > providerBudget) {
    throw new Error('Google Places provider budget would be exceeded');
  }
}

async function preflight(organizationId: string, estimatedCostUsd: number, priority: 'LOW'|'NORMAL'|'HIGH'|'CRITICAL' = 'LOW') {
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
  await preflight(input.organizationId, GOOGLE_PLACES_ID_SEARCH_ESTIMATED_COST_USD, 'LOW');
  const startedAt = Date.now();
  const placeIds = await client().discoverPlaceIds(input.query);
  const latencyMs = Date.now() - startedAt;

  await recordUsage({
    organizationId: input.organizationId,
    provider: 'GOOGLE_PLACES',
    operation: 'TEXT_SEARCH_IDS_ONLY',
    costUsd: GOOGLE_PLACES_ID_SEARCH_ESTIMATED_COST_USD,
    units: 1,
    metadata: {
      sku: 'Places API Text Search Essentials (IDs Only)',
      billingNote: 'IDs-only SKU currently has unlimited free usage; still guarded and metered.',
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

export async function controlledGooglePlaceDetails(input: {
  organizationId: string;
  placeId: string;
  countryCode: string;
  city: string;
}): Promise<DiscoveredBusiness> {
  await preflight(input.organizationId, GOOGLE_PLACES_DETAILS_BUDGET_RESERVE_USD, 'NORMAL');
  const startedAt = Date.now();
  const business = await client().getBusiness(input.placeId, { countryCode: input.countryCode, city: input.city });
  const latencyMs = Date.now() - startedAt;

  await recordUsage({
    organizationId: input.organizationId,
    provider: 'GOOGLE_PLACES',
    operation: 'PLACE_DETAILS_ENTERPRISE',
    costUsd: GOOGLE_PLACES_DETAILS_BUDGET_RESERVE_USD,
    units: 1,
    metadata: {
      sku: 'Places API Place Details Enterprise',
      billingNote: 'Conservative budget reserve per request; actual provider billing may be lower/free within Google monthly free usage.',
      placeId: input.placeId,
      latencyMs,
      fieldMask: 'id,displayName,formattedAddress,websiteUri,nationalPhoneNumber,primaryType',
    },
  });

  return business;
}
