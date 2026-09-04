import { describe, expect, it } from 'vitest';
import { conversationStageAfterCustomerReply } from '@/lib/conversations/sales-lifecycle';

describe('customer reply conversation stage transitions', () => {
  it('activates reply-driven lifecycle stages', () => {
    for (const stage of ['NEW', 'WAITING_CUSTOMER', 'UNANSWERED', 'FOLLOW_UP_DUE']) {
      expect(conversationStageAfterCustomerReply(stage)).toBe('ACTIVE');
    }
  });

  it('preserves higher-risk, terminal, and already-active stages', () => {
    for (const stage of ['ACTIVE', 'CLOSING', 'HOT', 'NEEDS_HUMAN', 'WON', 'LOST', 'DO_NOT_CONTACT', 'SPAM', 'PAUSED']) {
      expect(conversationStageAfterCustomerReply(stage)).toBe(stage);
    }
  });

  it('defaults a missing stage to ACTIVE for a real linked customer reply', () => {
    expect(conversationStageAfterCustomerReply(null)).toBe('ACTIVE');
  });
});
