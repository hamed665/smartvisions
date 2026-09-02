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

const headers = {
  authorization: `Bearer ${token}`,
  accept: 'application/json',
};

async function getJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) return { ok: false, status: response.status, body: null };
  return { ok: true, status: response.status, body: await response.json() };
}

function targetsProduction(row) {
  const target = row?.target;
  if (Array.isArray(target)) return target.includes('production');
  return target === 'production';
}

const listEndpoint = new URL(`${VERCEL_API}/v10/projects/${PROJECT_ID}/env`);
listEndpoint.searchParams.set('teamId', TEAM_ID);
const listed = await getJson(listEndpoint);
if (!listed.ok) throw new Error(`Vercel environment list API failed with HTTP ${listed.status}`);

const rows = Array.isArray(listed.body) ? listed.body : Array.isArray(listed.body?.envs) ? listed.body.envs : [];
const selected = new Map();
for (const row of rows) {
  const key = String(row?.key ?? '');
  if (!allowed.includes(key) || !targetsProduction(row) || row?.gitBranch) continue;
  if (!row?.id) continue;
  selected.set(key, row);
}

async function readDecrypted(row) {
  const projectUrl = new URL(`${VERCEL_API}/v1/projects/${PROJECT_ID}/env/${encodeURIComponent(row.id)}`);
  projectUrl.searchParams.set('teamId', TEAM_ID);
  const projectResult = await getJson(projectUrl);
  if (projectResult.ok && typeof projectResult.body?.value === 'string' && projectResult.body.value) {
    return projectResult.body.value;
  }

  const sharedUrl = new URL(`${VERCEL_API}/v1/env/${encodeURIComponent(row.id)}`);
  sharedUrl.searchParams.set('teamId', TEAM_ID);
  const sharedResult = await getJson(sharedUrl);
  if (sharedResult.ok && typeof sharedResult.body?.value === 'string' && sharedResult.body.value) {
    return sharedResult.body.value;
  }

  return '';
}

const out = {};
for (const [key, row] of selected) {
  const value = await readDecrypted(row);
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
  throw new Error(`Vercel Production decrypt API did not return required key name(s): ${missing.join(', ')}`);
}

fs.writeFileSync('.growth-runtime-secrets.json', JSON.stringify(out), { mode: 0o600 });
console.log(`Vercel Production decrypt export prepared ${Object.keys(out).length} binding(s); values were not printed.`);
