import { NextResponse } from 'next/server';
import { evaluateIntentOpportunity } from '@/lib/hunters/intent/evaluate';
import type { IntentOpportunity } from '@/lib/hunters/intent/types';

export async function POST(request: Request) {
  const body = (await request.json()) as IntentOpportunity;
  if (!body?.body || !body?.detectedAt || !body?.sourceType) {
    return NextResponse.json({ error: 'sourceType, body and detectedAt are required' }, { status: 400 });
  }

  return NextResponse.json(evaluateIntentOpportunity(body));
}
