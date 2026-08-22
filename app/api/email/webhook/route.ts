import { NextResponse } from 'next/server';
import { normalizeResendWebhook, verifyResendWebhook } from '@/lib/outreach/resend-webhook';
import { persistResendWebhookEvent } from '@/lib/outreach/email-lifecycle';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const eventId = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');

  if (!verifyResendWebhook({ rawBody, id: eventId, timestamp, signature })) {
    return NextResponse.json({ error: 'Invalid email webhook signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = normalizeResendWebhook(payload, eventId!);
  if (!event) return NextResponse.json({ accepted: true, ignored: true });

  try {
    const result = await persistResendWebhookEvent(event);
    return NextResponse.json({ accepted: true, ...result });
  } catch (error) {
    console.error('Email webhook processing failed', error);
    return NextResponse.json({ error: 'Email webhook processing failed' }, { status: 500 });
  }
}
