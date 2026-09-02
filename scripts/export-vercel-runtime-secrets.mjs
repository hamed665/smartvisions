import fs from 'node:fs';

const VERCEL_API = 'https://api.vercel.com';
const PROJECT_ID = 'prj_YcEy0QXjvWpSkM9LMFCnV02fYDgk';
const TEAM_ID = 'team_r17Axekt6ery8sFJbKnZv4Db';

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

const token = String(process.env.VERCEL_TOKEN ?? '').trim();
if (!token) throw new Error('VERCEL_TOKEN is required');

const endpoint = new URL(`${VERCEL_API}/v10/projects/${PROJECT_ID}/env`);
endpoint.searchParams.set('teamId', TEAM_ID);
endpoint.searchParams.set('decrypt', 'true');

const response = await fetch(endpoint, {
  headers: {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
  },
});
if (!response.ok) {
  throw new Error(`Vercel environment API request failed with HTTP ${response.status}`);
}

const payload = await response.json();
const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.envs) ? payload.envs : [];

function targetsProduction(row) {
  const target = row?.target;
  if (Array.isArray(target)) return target.includes('production');
  return target === 'production';
}

const byKey = new Map();
for (const row of rows) {
  const key = String(row?.key ?? '');
  if (!allowed.includes(key) || !targetsProduction(row)) continue;
  if (row?.gitBranch) continue;
  const value = typeof row?.value === 'string' ? row.value : '';
  if (!value) continue;
  byKey.set(key, value);
}

const out = Object.fromEntries([...byKey.entries()]);
const missing = required.filter((key) => !String(out[key] ?? '').trim());
if (!String(out.META_WHATSAPP_ACCESS_TOKEN ?? out.META_WHATSAPP_TOKEN ?? out.WHATSAPP_ACCESS_TOKEN ?? '').trim()) {
  missing.push('WhatsApp access token alias');
}
if (!String(out.META_WHATSAPP_PHONE_NUMBER_ID ?? out.WHATSAPP_PHONE_NUMBER_ID ?? '').trim()) {
  missing.push('WhatsApp phone-number ID alias');
}

if (missing.length) {
  throw new Error(`Vercel Production environment API did not return decrypted required key name(s): ${missing.join(', ')}`);
}

fs.writeFileSync('.growth-runtime-secrets.json', JSON.stringify(out), { mode: 0o600 });
console.log(`Vercel Production API export prepared ${Object.keys(out).length} binding(s); values were not printed.`);
