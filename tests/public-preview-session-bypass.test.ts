import { describe, expect, it } from 'vitest';
import { shouldBypassSession } from '@/lib/supabase/proxy';

describe('public preview session bypass', () => {
  it('allows tokenized public preview routes without an operator session', () => {
    expect(shouldBypassSession('/p/dcf27c1b-cffe-4e0d-affe-df234ce0bb6d')).toBe(true);
  });

  it('keeps operator preview studio and unrelated routes behind auth', () => {
    expect(shouldBypassSession('/preview-studio')).toBe(false);
    expect(shouldBypassSession('/p')).toBe(false);
    expect(shouldBypassSession('/leads')).toBe(false);
  });

  it('preserves existing internal and webhook bypasses', () => {
    expect(shouldBypassSession('/api/email/webhook')).toBe(true);
    expect(shouldBypassSession('/api/whatsapp/webhook')).toBe(true);
    expect(shouldBypassSession('/api/ai/process-inbound')).toBe(true);
    expect(shouldBypassSession('/api/outreach/approved-send')).toBe(true);
  });
});
