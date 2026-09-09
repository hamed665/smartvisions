import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { getTelegramRuntimeConfig } from '@/lib/telegram/config';
import { notifyTelegramOwner } from '@/lib/telegram/notifications';
import { buildOutreachReport } from '@/lib/telegram/outreach-command-center';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for Telegram daily digest');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function muscatClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Muscat', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { dateKey: `${map.year}-${map.month}-${map.day}`, hour: Number(map.hour), minute: Number(map.minute) };
}

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;
  const config = getTelegramRuntimeConfig();
  if (!config) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'TELEGRAM_NOT_CONFIGURED' });

  const clock = muscatClock();
  // End-of-day digest after the configured outreach window. Cron may call this often;
  // telegram_notification_events makes the event exactly-once per Oman calendar day.
  if (clock.hour < 19) return NextResponse.json({ ok: true, action: 'SKIPPED', reason: 'BEFORE_DAILY_DIGEST_WINDOW', dateKey: clock.dateKey });

  const supabase = serviceClient();
  const report = await buildOutreachReport({ supabase, organizationId: config.organizationId });
  const result = await notifyTelegramOwner({
    eventKey: `daily-outreach-digest:${clock.dateKey}`,
    notificationType: 'SYSTEM_ALERT',
    text: [`📬 گزارش روزانه Smart Visions`, '', report.text].join('\n'),
    entityType: 'daily_outreach_digest',
    entityId: clock.dateKey,
    payload: { source: 'OPERATIONS_CRON', dateKey: clock.dateKey, timezone: 'Asia/Muscat' },
    supabase,
  });
  return NextResponse.json({ ok: true, action: result.sent ? 'SENT' : 'SKIPPED', result });
}
