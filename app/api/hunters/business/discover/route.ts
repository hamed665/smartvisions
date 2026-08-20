import { NextResponse } from 'next/server';
import { controlledGooglePlacesIdSearch } from '@/lib/hunters/business/google-places-controlled';
import type { BusinessDiscoveryQuery } from '@/lib/hunters/business/types';
import { requireInternalApiKey } from '@/lib/security/internal-api';

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;

  const body = (await request.json()) as Partial<BusinessDiscoveryQuery> & { organizationId?: string };
  if (!body.organizationId || !body.countryCode || !body.city || !body.industry) {
    return NextResponse.json({ error: 'organizationId, countryCode, city and industry are required' }, { status: 400 });
  }

  const query: BusinessDiscoveryQuery = {
    countryCode: body.countryCode.toUpperCase(),
    city: body.city,
    industry: body.industry,
    limit: Math.max(1, Math.min(body.limit ?? 20, 20)),
  };

  try {
    const result = await controlledGooglePlacesIdSearch({ organizationId: body.organizationId, query });
    return NextResponse.json({ query, placeIds: result.placeIds, count: result.placeIds.length, latencyMs: result.latencyMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Places discovery failed';
    const status = message.includes('not configured') ? 503 : message.includes('blocked') || message.includes('budget') ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
