import { createHmac, randomUUID } from 'node:crypto';

const base = String(process.env.CANDIDATE_URL || '').replace(/\/$/, '');
if (!base) throw new Error('CANDIDATE_URL is required');

let failures = 0;

async function check(path, init, expected, label) {
  try {
    const response = await fetch(`${base}${path}`, { redirect: 'manual', ...init });
    const ok = expected.includes(response.status);
    console.log(`${label}: HTTP ${response.status} ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) failures += 1;
    return response;
  } catch (error) {
    console.error(`${label}: request failed`);
    failures += 1;
    return null;
  }
}

await check('/login', {}, [200], 'login page');
await check('/', {}, [301, 302, 303, 307, 308], 'unauthenticated app redirect');
await check(`/p/cloudflare-migration-missing-${Date.now()}`, {}, [404], 'Supabase-backed public preview miss');

if (process.env.INTERNAL_API_KEY) {
  const guardedPosts = [
    '/api/ai/process-inbound',
    '/api/email/send',
    '/api/hunters/business/audit',
    '/api/hunters/business/discover',
    '/api/outreach/approved-send',
    '/api/outreach/message-plan',
    '/api/whatsapp/send',
    '/api/whatsapp/voice/transcribe',
  ];
  for (const path of guardedPosts) {
    await check(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }, [401], `${path} internal-auth guard`);
  }
} else {
  console.log('Provider/API guard smoke skipped: INTERNAL_API_KEY not present in minimal candidate.');
}

const metaSecret = process.env.META_APP_SECRET;
const metaVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
if (metaSecret && metaVerifyToken) {
  await check('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=cloudflare-invalid-fixture&hub.challenge=safe', {}, [403], 'WhatsApp verification reject path');
  await check('/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=invalid-fixture' },
    body: '{}',
  }, [401], 'WhatsApp signature reject path');

  const rawBody = '{}';
  const signature = `sha256=${createHmac('sha256', metaSecret).update(rawBody, 'utf8').digest('hex')}`;
  await check('/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body: rawBody,
  }, [200], 'WhatsApp valid-signature empty-event path');
} else {
  console.log('WhatsApp signed smoke skipped: provider secrets not present in minimal candidate.');
}

const emailSecret = process.env.EMAIL_WEBHOOK_SECRET;
if (emailSecret) {
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
  console.log('Email signed smoke skipped: provider secret not present in minimal candidate.');
}

if (process.env.TELEGRAM_WEBHOOK_SECRET) {
  await check('/api/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }, [401], 'Telegram secret-token reject path');
} else {
  console.log('Telegram webhook smoke skipped: provider secret not present in minimal candidate.');
}

if (failures) throw new Error(`Cloudflare safe smoke failed with ${failures} check(s)`);
console.log('Cloudflare safe smoke passed. No outbound provider send was invoked.');
