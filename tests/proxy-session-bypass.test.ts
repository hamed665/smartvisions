import { describe, expect, it } from 'vitest';
import { shouldBypassSession } from '@/lib/supabase/proxy';

describe('session proxy bypass paths', () => {
  it('bypasses session auth for signed/public webhooks', () => {
    expect(shouldBypassSession('/api/email/webhook')).toBe(true);
    expect(shouldBypassSession('/api/whatsapp/webhook')).toBe(true);
  });

  it('bypasses session auth for the internal-key-protected AI inbound endpoint', () => {
    expect(shouldBypassSession('/api/ai/process-inbound')).toBe(true);
  });

  it('keeps normal application and unrelated API routes behind session auth', () => {
    expect(shouldBypassSession('/approvals')).toBe(false);
    expect(shouldBypassSession('/api/outreach/approved-send')).toBe(false);
    expect(shouldBypassSession('/api/ai/process-inbound/extra')).toBe(false);
  });
});
