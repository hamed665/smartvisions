import fs from 'node:fs';

const allowed = [
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
];

const required = [
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
];

const out = {};
for (const key of allowed) {
  const value = String(process.env[key] ?? '');
  if (value) out[key] = value;
}

const missing = required.filter((key) => !String(out[key] ?? '').trim());
if (!String(out.META_WHATSAPP_ACCESS_TOKEN ?? out.META_WHATSAPP_TOKEN ?? out.WHATSAPP_ACCESS_TOKEN ?? '').trim()) {
  missing.push('WhatsApp access token alias');
}
if (!String(out.META_WHATSAPP_PHONE_NUMBER_ID ?? out.WHATSAPP_PHONE_NUMBER_ID ?? '').trim()) {
  missing.push('WhatsApp phone-number ID alias');
}

if (missing.length) {
  throw new Error(`Vercel Production environment is missing or cannot export required key name(s): ${missing.join(', ')}`);
}

fs.writeFileSync('.growth-runtime-secrets.json', JSON.stringify(out), { mode: 0o600 });
console.log(`Vercel Production runtime secret export prepared ${Object.keys(out).length} binding(s); values were not printed.`);
