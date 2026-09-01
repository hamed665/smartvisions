import { describe, expect, it } from 'vitest';
import { shouldBypassSession } from '@/lib/supabase/proxy';

describe('session proxy bypass paths', () => {
  it('bypasses session auth for signed/public webhooks', () => {
    expect(shouldBypassSession('/api/email/webhook')).toBe(true);
    expect(shouldBypassSession('/api/whatsapp/webhook')).toBe(true);
    expect(shouldBypassSession('/api/telegram/webhook')).toBe(true);
  });

  it('bypasses session auth only for exact internal-key-protected server endpoints', () => {
    expect(shouldBypassSession('/api/ai/process-inbound')).toBe(true);
    expect(shouldBypassSession('/api/outreach/approved-send')).toBe(true);
    expect(shouldBypassSession('/api/telegram/notify')).toBe(true);
  });

  it('keeps normal application and non-exact API routes behind session auth', () => {
    expect(shouldBypassSession('/approvals')).toBe(false);
    expect(shouldBypassSession('/api/outreach/approved-send/extra')).toBe(false);
    expect(shouldBypassSession('/api/ai/process-inbound/extra')).toBe(false);
    expect(shouldBypassSession('/api/telegram/webhook/extra')).toBe(false);
    expect(shouldBypassSession('/api/telegram/notify/extra')).toBe(false);
  });
});
