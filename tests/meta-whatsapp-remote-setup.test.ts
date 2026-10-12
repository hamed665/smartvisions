import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const integrationsPage = readFileSync(
  new URL('../app/integrations/page.tsx', import.meta.url),
  'utf8',
);

vi.mock('server-only', () => ({}));

import {
  createWhatsAppRemoteSetupSecret,
  hashWhatsAppRemoteSetupSecret,
  normalizeWhatsAppRemoteSetupSecret,
  whatsappRemoteSetupCookieOptions,
} from '@/lib/whatsapp/remote-setup';

describe('WhatsApp remote setup capability', () => {
  it('keeps operator and remote setup fail-closed until the Meta configuration is explicitly v4', () => {
    expect(integrationsPage).toContain('META_WHATSAPP_EMBEDDED_SIGNUP_VERSION');
    expect(integrationsPage).toContain("toLowerCase() === 'v4'");
    expect(integrationsPage).toContain('embeddedSignupVersion=');
  });

  it('creates 256-bit hex secrets and validates only that format', () => {
    const secret = createWhatsAppRemoteSetupSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(normalizeWhatsAppRemoteSetupSecret(secret)).toBe(secret);
    expect(normalizeWhatsAppRemoteSetupSecret('short')).toBeNull();
    expect(normalizeWhatsAppRemoteSetupSecret('FULL_MIGRATION_FROM_BUSINESS_APP')).toBeNull();
  });

  it('hashes the bearer before persistence', async () => {
    const secret = 'a'.repeat(64);
    const hash = await hashWhatsAppRemoteSetupSecret(secret);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(secret);
  });

  it('keeps the session cookie HttpOnly and scoped to the setup surface', () => {
    const options = whatsappRemoteSetupCookieOptions('2030-01-01T00:00:00.000Z');
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('strict');
    expect(options.path).toBe('/setup/whatsapp');
    expect(options.expires.toISOString()).toBe('2030-01-01T00:00:00.000Z');
  });
});
