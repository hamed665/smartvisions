import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { evaluateSendWindow, type MarketCode } from '@/lib/outreach/scheduler';

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as { marketCode?: MarketCode; leadTimezone?: string; nowUtc?: string };
  if (!body.marketCode) return NextResponse.json({ error: 'marketCode is required' }, { status: 400 });

  const nowUtc = body.nowUtc ? new Date(body.nowUtc) : undefined;
  if (nowUtc && Number.isNaN(nowUtc.getTime())) return NextResponse.json({ error: 'nowUtc is invalid' }, { status: 400 });

  return NextResponse.json(evaluateSendWindow({ marketCode: body.marketCode, leadTimezone: body.leadTimezone, nowUtc }));
}
