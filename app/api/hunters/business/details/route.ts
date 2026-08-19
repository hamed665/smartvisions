import { NextResponse } from 'next/server';
import { GooglePlacesClient } from '@/lib/hunters/business/google-places';
import { requireInternalApiKey } from '@/lib/security/internal-api';

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY is not configured' }, { status: 503 });

  const body = (await request.json()) as { placeId?: string; countryCode?: string; city?: string };
  if (!body.placeId || !body.countryCode || !body.city) {
    return NextResponse.json({ error: 'placeId, countryCode and city are required' }, { status: 400 });
  }

  const client = new GooglePlacesClient(apiKey);
  const business = await client.getBusiness(body.placeId, { countryCode: body.countryCode, city: body.city });
  return NextResponse.json(business);
}
