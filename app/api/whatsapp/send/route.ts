import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { evaluateLocalWindow, type MarketCode } from '@/lib/outreach/scheduler';
import { MetaCloudWhatsAppProvider } from '@/lib/whatsapp/meta-cloud';

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as {
    to?: string;
    text?: string;
    marketCode?: MarketCode;
    leadTimezone?: string;
    agentMode?: 'AUTO' | 'PAUSED' | 'HUMAN';
    shadowMode?: boolean;
    replyToMessageId?: string;
  };

  if (!body.to || !body.text || !body.marketCode) {
    return NextResponse.json({ error: 'to, text and marketCode are required' }, { status: 400 });
  }
  if (body.agentMode === 'HUMAN') return NextResponse.json({ error: 'AI sending is blocked during human takeover' }, { status: 409 });
  if (body.agentMode === 'PAUSED') return NextResponse.json({ error: 'AI sending is paused' }, { status: 409 });
  if (body.shadowMode) return NextResponse.json({ error: 'Shadow mode requires human review before send' }, { status: 409 });

  const window = evaluateLocalWindow({ marketCode: body.marketCode, leadTimezone: body.leadTimezone });
  if (!window.allowed) return NextResponse.json({ error: 'Outside recipient local send window', window }, { status: 409 });

  const provider = new MetaCloudWhatsAppProvider();
  const result = await provider.sendText({ to: body.to, text: body.text, replyToMessageId: body.replyToMessageId });
  return NextResponse.json(result);
}
