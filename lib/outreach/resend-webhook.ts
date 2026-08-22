import { createHmac, timingSafeEqual } from 'node:crypto';

export type ResendWebhookEvent = {
  eventId: string;
  eventType: string;
  providerMessageId?: string;
  occurredAt: string;
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  messageId?: string;
  bounceDetail?: string;
  raw: Record<string, unknown>;
};

function decodeWebhookSecret(secret: string) {
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  return Buffer.from(raw, 'base64');
}

function safeEqualBase64(expected: Buffer, signature: string) {
  try {
    const received = Buffer.from(signature, 'base64');
    return received.length === expected.length && timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

export function verifyResendWebhook(input: {
  rawBody: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret?: string;
  nowMs?: number;
  toleranceSeconds?: number;
}) {
  const secret = input.secret ?? process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret || !input.id || !input.timestamp || !input.signature) return false;

  const timestampNumber = Number(input.timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  const nowMs = input.nowMs ?? Date.now();
  const toleranceMs = (input.toleranceSeconds ?? 300) * 1000;
  if (Math.abs(nowMs - timestampNumber * 1000) > toleranceMs) return false;

  let key: Buffer;
  try {
    key = decodeWebhookSecret(secret);
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const signed = `${input.id}.${input.timestamp}.${input.rawBody}`;
  const expected = createHmac('sha256', key).update(signed, 'utf8').digest();
  const candidates = input.signature
    .split(' ')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part.startsWith('v1,') ? part.slice(3) : part);
  return candidates.some(candidate => safeEqualBase64(expected, candidate));
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.find(item => typeof item === 'string') as string | undefined;
  return undefined;
}

export function normalizeResendWebhook(payload: unknown, eventId: string): ResendWebhookEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const eventType = typeof root.type === 'string' ? root.type : '';
  if (!eventType.startsWith('email.')) return null;
  const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : {};
  const bounce = data.bounce && typeof data.bounce === 'object' ? data.bounce as Record<string, unknown> : {};
  const occurredAt = typeof root.created_at === 'string'
    ? root.created_at
    : typeof data.created_at === 'string'
      ? data.created_at
      : new Date().toISOString();

  return {
    eventId,
    eventType,
    providerMessageId: typeof data.email_id === 'string' ? data.email_id : undefined,
    occurredAt,
    from: firstString(data.from),
    to: firstString(data.to),
    subject: typeof data.subject === 'string' ? data.subject : undefined,
    text: typeof data.text === 'string' ? data.text : undefined,
    messageId: typeof data.message_id === 'string' ? data.message_id : undefined,
    bounceDetail: typeof bounce.message === 'string' ? bounce.message : undefined,
    raw: root,
  };
}
