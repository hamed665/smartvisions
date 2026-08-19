import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { buildMessagePlan } from '@/lib/outreach/message-plan';
import type { MarketCode } from '@/lib/outreach/scheduler';

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as {
    marketCode?: MarketCode;
    businessName?: string;
    industry?: string;
    detectedLanguage?: string;
    preferredLanguage?: string;
    evidence?: string[];
    recommendedOffer?: string;
    recipientRole?: string;
  };

  if (!body.marketCode || !body.businessName || !body.recommendedOffer) {
    return NextResponse.json({ error: 'marketCode, businessName and recommendedOffer are required' }, { status: 400 });
  }

  try {
    return NextResponse.json(buildMessagePlan({
      marketCode: body.marketCode,
      businessName: body.businessName,
      industry: body.industry,
      detectedLanguage: body.detectedLanguage,
      preferredLanguage: body.preferredLanguage,
      evidence: body.evidence ?? [],
      recommendedOffer: body.recommendedOffer,
      recipientRole: body.recipientRole,
    }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to build message plan' }, { status: 400 });
  }
}
