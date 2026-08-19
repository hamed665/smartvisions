import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { getQuote, type AddonId, type ServiceId } from '@/lib/outreach/pricing';
import type { MarketCode } from '@/lib/outreach/scheduler';

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as {
    serviceId?: ServiceId;
    marketCode?: MarketCode;
    requestedDiscountPct?: number;
    addons?: AddonId[];
  };

  if (!body.serviceId || !body.marketCode) {
    return NextResponse.json({ error: 'serviceId and marketCode are required' }, { status: 400 });
  }

  try {
    return NextResponse.json(getQuote({
      serviceId: body.serviceId,
      marketCode: body.marketCode,
      requestedDiscountPct: body.requestedDiscountPct,
      addons: body.addons,
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to quote' }, { status: 400 });
  }
}
