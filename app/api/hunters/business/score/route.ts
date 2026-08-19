import { NextResponse } from 'next/server';
import { scoreOpportunity, type OpportunityInput } from '@/lib/scoring/opportunity';
import { recommendOffer, type OfferInput } from '@/lib/scoring/offer';

export async function POST(request: Request) {
  const body = (await request.json()) as { opportunity: OpportunityInput; offer: OfferInput };

  if (!body?.opportunity || !body?.offer) {
    return NextResponse.json({ error: 'opportunity and offer are required' }, { status: 400 });
  }

  return NextResponse.json({
    opportunity: scoreOpportunity(body.opportunity),
    recommendation: recommendOffer(body.offer),
  });
}
