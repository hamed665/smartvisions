import fs from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';

const base = String(process.env.CANDIDATE_URL || '').replace(/\/$/, '');
if (!base) throw new Error('CANDIDATE_URL is required');

let bundledSecrets = {};
if (process.env.GROWTH_PRODUCTION_SECRETS_JSON) {
  try {
    const parsed = JSON.parse(process.env.GROWTH_PRODUCTION_SECRETS_JSON);
    if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') bundledSecrets = parsed;
  } catch {
    throw new Error('GROWTH_PRODUCTION_SECRETS_JSON is not valid JSON');
  }
}

let fileSecrets = {};
if (process.env.RUNTIME_SECRETS_FILE) {
  try {
    const parsed = JSON.parse(fs.readFileSync(process.env.RUNTIME_SECRETS_FILE, 'utf8'));
    if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') fileSecrets = parsed;
  } catch {
    throw new Error('RUNTIME_SECRETS_FILE is not valid readable JSON');
  }
}

const secret = (key) => String(process.env[key] ?? bundledSecrets[key] ?? fileSecrets[key] ?? '').trim();
let failures = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, init = {}) {
  return fetch(`${base}${path}`, { redirect: 'manual', ...init });
}

async function check(path, init, expected, label) {
  try {
    const response = await request(path, init);
    const ok = expected.includes(response.status);
    console.log(`${label}: HTTP ${response.status} ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) failures += 1;
    return response;
  } catch {
    console.error(`${label}: request failed`);
    failures += 1;
    return null;
  }
}

async function waitForStatus(path, init, expected, retryable, label, attempts = 15) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await request(path, init);
      lastStatus = response.status;
      if (expected.includes(lastStatus)) {
        console.log(`${label}: HTTP ${lastStatus} PASS`);
        return response;
      }
      if (!retryable.includes(lastStatus)) break;
    } catch {
      lastStatus = 0;
    }
    if (attempt < attempts) await sleep(1000);
  }
  console.error(`${label}: HTTP ${lastStatus || 'request-failed'} FAIL`);
  failures += 1;
  return null;
}

await check('/login', {}, [200], 'login page');
await check('/', {}, [301, 302, 303, 307, 308], 'unauthenticated app redirect');
await check('/p/__cloudflare_notfound_probe__', {}, [404], 'candidate direct notFound probe');
await check(`/p/cloudflare-migration-missing-${Date.now()}`, {}, [404], 'Supabase-backed public preview miss');

const internalProbe = {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
};
await waitForStatus(
  '/api/ai/process-inbound',
  internalProbe,
  [401],
  [503],
  'INTERNAL_API_KEY runtime visibility and internal-auth guard',
);

await check('/api/outreach/approved-send', internalProbe, [401], '/api/outreach/approved-send internal-auth guard');

const sessionProtectedPosts = [
  '/api/email/send',
  '/api/hunters/business/audit',
  '/api/hunters/business/discover',
  '/api/outreach/message-plan',
  '/api/whatsapp/send',
  '/api/whatsapp/voice/transcribe',
];
for (const path of sessionProtectedPosts) {
  await check(path, internalProbe, [301, 302, 303, 307, 308], `${path} unauthenticated session guard`);
}

await check('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=cloudflare-invalid-fixture&hub.challenge=safe', {}, [403], 'WhatsApp verification reject path');
await check('/api/whatsapp/webhook', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=invalid-fixture' },
  body: '{}',
}, [401], 'WhatsApp signature reject path');

const metaSecret = secret('META_APP_SECRET');
if (metaSecret) {
  const rawBody = '{}';
  const signature = `sha256=${createHmac('sha256', metaSecret).update(rawBody, 'utf8').digest('hex')}`;
  await check('/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body: rawBody,
  }, [200], 'WhatsApp valid-signature empty-event path');
} else {
  console.log('WhatsApp valid-signature no-op smoke skipped: META_APP_SECRET not locally available.');
}

await check('/api/email/webhook', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'svix-id': 'cloudflare-invalid-fixture',
    'svix-timestamp': String(Math.floor(Date.now() / 1000)),
    'svix-signature': 'v1,invalid-fixture',
  },
  body: '{}',
}, [401], 'Email signature reject path');

const emailSecret = secret('EMAIL_WEBHOOK_SECRET');
if (emailSecret) {
  const rawBody = '{}';
  const id = `cf_${randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const encoded = emailSecret.startsWith('whsec_') ? emailSecret.slice(6) : emailSecret;
  const key = Buffer.from(encoded, 'base64');
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');
  await check('/api/email/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    },
    body: rawBody,
  }, [200], 'Email valid-signature ignored-event path');
} else {
  console.log('Email valid-signature no-op smoke skipped: EMAIL_WEBHOOK_SECRET not locally available.');
}

await check('/api/telegram/webhook', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
}, [401], 'Telegram secret-token reject path');

if (failures) throw new Error(`Cloudflare safe smoke failed with ${failures} check(s)`);
console.log('Cloudflare safe smoke passed. No outbound provider send was invoked.');
