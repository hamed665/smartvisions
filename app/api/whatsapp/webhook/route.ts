import { NextResponse } from 'next/server';
import { persistWhatsAppWebhookEvents } from '@/lib/whatsapp/persistence';
import { runInternalTestLiveReply, type InternalTestLiveReplyResult } from '@/lib/whatsapp/internal-test-live-reply';
import { extractWhatsAppInbound, extractWhatsAppStatuses, verifyMetaSignature } from '@/lib/whatsapp/webhook';

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
  const statuses = extractWhatsAppStatuses(payload);

  try {
    const persistence = await persistWhatsAppWebhookEvents({ inbound, statuses });
    let liveTest: InternalTestLiveReplyResult = { attempted: false, sent: false, reason: 'NO_ELIGIBLE_TEXT_INBOUND' };

    // Normal customer traffic remains on the existing durable Cron/Agent path. Only a
    // time-boxed, exact-recipient INTERNAL_TEST rule can turn this into an immediate
    // in-process Agent + controlled approved-send attempt. Live-test failure never
    // changes webhook acknowledgement, because a Meta retry must not become a send retry.
    if ('organizationId' in persistence && typeof persistence.organizationId === 'string') {
      for (const event of inbound.filter((item) => item.type === 'text').slice(0, 3)) {
        try {
          const result = await runInternalTestLiveReply({
            organizationId: persistence.organizationId,
            providerMessageId: event.providerMessageId,
            inboundFrom: event.from,
            messageType: event.type,
          });
          liveTest = result;
          if (result.attempted) break;
        } catch {
          liveTest = { attempted: true, sent: false, reason: 'LIVE_TEST_FAILED_NO_WEBHOOK_RETRY' };
          break;
        }
      }
    }

    return NextResponse.json({
      accepted: true,
      inboundCount: inbound.length,
      statusCount: statuses.length,
      persistence,
      liveTest,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'WhatsApp webhook persistence failed',
    }, { status: 503 });
  }
}
