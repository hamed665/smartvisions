import 'server-only';

export const WHATSAPP_REMOTE_SETUP_COOKIE = 'sv_whatsapp_setup';

const SECRET_RE = /^[0-9a-f]{64}$/;

export function createWhatsAppRemoteSetupSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeWhatsAppRemoteSetupSecret(value: unknown) {
  const secret = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SECRET_RE.test(secret) ? secret : null;
}

export async function hashWhatsAppRemoteSetupSecret(secret: string) {
  const normalized = normalizeWhatsAppRemoteSetupSecret(secret);
  if (!normalized) throw new Error('Invalid WhatsApp remote setup secret');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function whatsappRemoteSetupCookieOptions(expiresAt: string | Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/setup/whatsapp',
    expires: expiresAt instanceof Date ? expiresAt : new Date(expiresAt),
  };
}
