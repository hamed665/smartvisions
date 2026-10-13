import { NextResponse } from 'next/server';
import { persistWhatsAppWebhookEvents } from '@/lib/whatsapp/persistence';
import { extractWhatsAppInbound, extractWhatsAppNativeEchoes, extractWhatsAppStatuses, verifyMetaSignature } from '@/lib/whatsapp/webhook';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Webhook verification failed' }, { status: 403 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifyMetaSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const inbound = extractWhatsAppInbound(payload);
  const nativeEchoes = extractWhatsAppNativeEchoes(payload);
  const statuses = extractWhatsAppStatuses(payload);

  try {
    const persistence = await persistWhatsAppWebhookEvents({ inbound, nativeEchoes, statuses });
    // Paid work stays behind the existing durable scheduled executor. Meta delivery
    // retries only persist the same canonical inbound; they cannot invoke AI/send.
    return NextResponse.json({
      accepted: true,
      inboundCount: inbound.length,
      nativeEchoCount: nativeEchoes.length,
      statusCount: statuses.length,
      persistence,
      liveTest: { attempted: false, sent: false, reason: 'DURABLE_EXECUTOR_ONLY' },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'WhatsApp webhook persistence failed',
    }, { status: 503 });
  }
}
