import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { getQuote, type ServiceId } from '@/lib/outreach/pricing';
import type { MarketCode } from '@/lib/outreach/scheduler';

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as { serviceId?: ServiceId; marketCode?: MarketCode; requestedDiscountPct?: number };
  if (!body.serviceId || !body.marketCode) {
    return NextResponse.json({ error: 'serviceId and marketCode are required' }, { status: 400 });
  }

  try {
    return NextResponse.json(getQuote(body as Required<Pick<typeof body, 'serviceId' | 'marketCode'>> & Pick<typeof body, 'requestedDiscountPct'>));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to quote' }, { status: 400 });
  }
}
