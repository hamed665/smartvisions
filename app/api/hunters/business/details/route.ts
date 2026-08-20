import { NextResponse } from 'next/server';
import { controlledGooglePlaceDetails } from '@/lib/hunters/business/google-places-controlled';
import { requireInternalApiKey } from '@/lib/security/internal-api';

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;

  const body = (await request.json()) as { organizationId?: string; placeId?: string; countryCode?: string; city?: string };
  if (!body.organizationId || !body.placeId || !body.countryCode || !body.city) {
    return NextResponse.json({ error: 'organizationId, placeId, countryCode and city are required' }, { status: 400 });
  }

  try {
    const business = await controlledGooglePlaceDetails({
      organizationId: body.organizationId,
      placeId: body.placeId,
      countryCode: body.countryCode.toUpperCase(),
      city: body.city,
    });
    return NextResponse.json(business);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Place Details failed';
    const status = message.includes('not configured') ? 503 : message.includes('blocked') || message.includes('budget') ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
