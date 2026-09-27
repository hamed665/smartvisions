import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeTelegramCustomerUpdate } from '@/lib/telegram/customer-webhook';
import { persistTelegramCustomerEvent } from '@/lib/telegram/customer-persistence';
import { resolveTelegramCustomerWebhookContext } from '@/lib/telegram/customer-routing';

export const runtime = 'nodejs';

const MAX_WEBHOOK_BYTES = 512 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Telegram customer webhook service configuration is missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function secretMatches(received: string | null, expected: string) {
  if (!received) return false;
  const left = Buffer.from(received, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bindingId: string }> },
) {
  const { bindingId } = await params;
  if (!UUID_RE.test(bindingId)) {
    return NextResponse.json({ error: 'Telegram customer binding not found' }, { status: 404 });
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: 'Telegram webhook payload too large' }, { status: 413 });
  }

  let context;
  try {
    context = await resolveTelegramCustomerWebhookContext({
      service: serviceClient(),
      bindingId,
    });
  } catch {
    return NextResponse.json({ error: 'Telegram customer binding not found' }, { status: 404 });
  }

  if (!secretMatches(request.headers.get('x-telegram-bot-api-secret-token'), context.webhookSecret)) {
    return NextResponse.json({ error: 'Unauthorized Telegram customer webhook' }, { status: 401 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: 'Telegram webhook payload too large' }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid Telegram webhook JSON' }, { status: 400 });
  }

  let event;
  try {
    event = normalizeTelegramCustomerUpdate(parsed);
  } catch {
    return NextResponse.json({ error: 'Invalid Telegram customer update' }, { status: 400 });
  }
  if (!event) return NextResponse.json({ ok: true, ignored: true });

  try {
    const result = await persistTelegramCustomerEvent({ context, event });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    // Failures before an ambiguous Chatwoot side effect are retryable by Telegram.
    // Ambiguous Chatwoot side effects are converted to RECONCILIATION_REQUIRED
    // inside persistence and return 200, so Telegram does not cause a blind retry.
    return NextResponse.json({ error: 'Telegram customer update processing unavailable' }, { status: 503 });
  }
}
