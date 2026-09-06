import { describe, expect, it } from 'vitest';
import {
  evaluateOwnerManualReplyAccess,
  normalizeOwnerReplyText,
  ownerManualReplyIdempotencyKey,
} from '@/lib/outreach/owner-manual-reply';

const takeover = {
  channel: 'WHATSAPP',
  leadStatus: 'REPLIED',
  leadAgentMode: 'HUMAN',
  conversationStage: 'ACTIVE',
  conversationAgentMode: 'HUMAN',
  conversationRequiresHuman: true,
};

describe('owner manual reply access', () => {
  it('allows WhatsApp only during a full owner takeover', () => {
    expect(evaluateOwnerManualReplyAccess(takeover)).toEqual({ allowed: true, blocks: [] });
  });

  it('requires all takeover markers to remain active', () => {
    const result = evaluateOwnerManualReplyAccess({ ...takeover, leadAgentMode: 'AUTO' });
    expect(result.allowed).toBe(false);
    expect(result.blocks).toContain('OWNER_TAKEOVER_REQUIRED');
  });

  it('blocks unsupported channels and terminal records', () => {
    const result = evaluateOwnerManualReplyAccess({
      ...takeover,
      channel: 'EMAIL',
      leadStatus: 'DO_NOT_CONTACT',
      conversationStage: 'SPAM',
    });
    expect(result.blocks).toEqual(expect.arrayContaining([
      'OWNER_MANUAL_WHATSAPP_ONLY',
      'TERMINAL_LEAD',
      'TERMINAL_CONVERSATION',
    ]));
  });
});

describe('owner manual reply text and idempotency', () => {
  it('trims accepted text', () => {
    expect(normalizeOwnerReplyText('  Hello customer  ')).toBe('Hello customer');
  });

  it('rejects empty and oversized text', () => {
    expect(() => normalizeOwnerReplyText('   ')).toThrow('Reply text is required');
    expect(() => normalizeOwnerReplyText('a'.repeat(4097))).toThrow('4096');
  });

  it('builds a stable conversation-scoped idempotency key', () => {
    expect(ownerManualReplyIdempotencyKey('conversation-1', 'request-1'))
      .toBe('owner-manual:conversation-1:request-1');
    expect(() => ownerManualReplyIdempotencyKey('', 'request-1')).toThrow();
  });
});
