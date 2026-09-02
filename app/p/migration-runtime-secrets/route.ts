import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

const ALLOWED_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_AGENT_MODEL',
  'GOOGLE_PLACES_API_KEY',
  'META_WHATSAPP_ACCESS_TOKEN',
  'META_WHATSAPP_TOKEN',
  'META_WHATSAPP_PHONE_NUMBER_ID',
  'META_WHATSAPP_CATALOG_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_CATALOG_ID',
  'META_GRAPH_VERSION',
  'META_APP_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
  'EMAIL_PROVIDER_API_KEY',
  'EMAIL_WEBHOOK_SECRET',
  'REDIS_URL',
  'CRAWL4AI_URL',
  'INTERNAL_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_OWNER_USER_ID',
  'TELEGRAM_OWNER_CHAT_ID',
  'TELEGRAM_ORGANIZATION_ID',
] as const;

const REQUIRED_KEYS = [
  'OPENAI_API_KEY',
  'GOOGLE_PLACES_API_KEY',
  'INTERNAL_API_KEY',
  'META_APP_SECRET',
  'META_WEBHOOK_VERIFY_TOKEN',
  'EMAIL_PROVIDER_API_KEY',
  'EMAIL_WEBHOOK_SECRET',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_OWNER_USER_ID',
  'TELEGRAM_OWNER_CHAT_ID',
  'TELEGRAM_ORGANIZATION_ID',
] as const;

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const expected = String(process.env.MIGRATION_EXPORT_TOKEN ?? '');
  const provided = String(request.headers.get('x-migration-token') ?? '');
  const enabled = process.env.MIGRATION_EXPORT_ENABLED === '1';

  if (!enabled || !expected || !provided || !secureEqual(expected, provided)) {
    return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  }

  const values: Record<string, string> = {};
  for (const key of ALLOWED_KEYS) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length > 0) values[key] = value;
  }

  const missing: string[] = REQUIRED_KEYS.filter((key) => !values[key]?.trim());
  if (!String(values.META_WHATSAPP_ACCESS_TOKEN ?? values.META_WHATSAPP_TOKEN ?? values.WHATSAPP_ACCESS_TOKEN ?? '').trim()) {
    missing.push('WhatsApp access token alias');
  }
  if (!String(values.META_WHATSAPP_PHONE_NUMBER_ID ?? values.WHATSAPP_PHONE_NUMBER_ID ?? '').trim()) {
    missing.push('WhatsApp phone-number ID alias');
  }

  if (missing.length > 0) {
    return Response.json(
      { error: 'MIGRATION_RUNTIME_KEYS_MISSING', keys: [...new Set(missing)] },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  return Response.json(values, {
    status: 200,
    headers: {
      'cache-control': 'no-store, private',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
