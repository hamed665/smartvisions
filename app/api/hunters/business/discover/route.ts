import { NextResponse } from 'next/server';
import { GooglePlacesClient } from '@/lib/hunters/business/google-places';
import type { BusinessDiscoveryQuery } from '@/lib/hunters/business/types';
import { requireInternalApiKey } from '@/lib/security/internal-api';

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY is not configured' }, { status: 503 });

  const body = (await request.json()) as Partial<BusinessDiscoveryQuery>;
  if (!body.countryCode || !body.city || !body.industry) {
    return NextResponse.json({ error: 'countryCode, city and industry are required' }, { status: 400 });
  }

  const query: BusinessDiscoveryQuery = {
    countryCode: body.countryCode,
    city: body.city,
    industry: body.industry,
    limit: Math.max(1, Math.min(body.limit ?? 20, 20)),
  };

  const client = new GooglePlacesClient(apiKey);
  const placeIds = await client.discoverPlaceIds(query);
  return NextResponse.json({ query, placeIds, count: placeIds.length });
}
