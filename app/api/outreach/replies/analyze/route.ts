import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { calculateIntentScore, classifyReply, extractReplySignals } from '@/lib/outreach/replies';

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as { text?: string };
  if (!body.text?.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 });

  const signals = extractReplySignals(body.text);
  return NextResponse.json({
    category: classifyReply(body.text),
    signals,
    intent: calculateIntentScore(signals),
    stopFollowups: signals.unsubscribe || signals.negative || signals.positive || signals.askedPrice || signals.askedMeeting || signals.askedPayment || signals.askedPortfolio || signals.askedTimeline,
  });
}
