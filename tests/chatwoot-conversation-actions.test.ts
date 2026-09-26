import { describe, expect, it } from 'vitest';

import {
  externalConversationMatchesTarget,
  mutationRequestForUnifiedInboxAction,
  parseUnifiedInboxConversationActionBody,
  UnifiedInboxActionError,
} from '@/lib/chatwoot/conversation-actions';

const CONVERSATION_ID = '72000000-0000-4000-8000-000000009810';

describe('Chatwoot Unified Inbox conversation actions', () => {
  it('normalizes bounded status actions', () => {
    expect(parseUnifiedInboxConversationActionBody(CONVERSATION_ID, {
      requestId: 'req-status-0001',
      action: 'status',
      status: 'SNOOZED',
      snoozedUntil: 1_800_000_000,
    })).toEqual({
      conversationId: CONVERSATION_ID,
      requestId: 'req-status-0001',
      action: {
        action: 'STATUS',
        status: 'snoozed',
        snoozedUntil: 1_800_000_000,
      },
    });
  });

  it('deduplicates and sorts labels before they cross the claim/provider boundary', () => {
    const parsed = parseUnifiedInboxConversationActionBody(CONVERSATION_ID, {
      requestId: 'req-labels-0001',
      action: 'LABELS',
      labels: [' vip ', 'sales', 'vip'],
    });
    expect(parsed.action).toEqual({
      action: 'LABELS',
      labels: ['sales', 'vip'],
    });
  });

  it('fails closed on malformed and cross-shape payloads', () => {
    expect(() => parseUnifiedInboxConversationActionBody(CONVERSATION_ID, {
      requestId: 'short',
      action: 'STATUS',
      status: 'resolved',
    })).toThrow(UnifiedInboxActionError);

    expect(() => parseUnifiedInboxConversationActionBody(CONVERSATION_ID, {
      requestId: 'req-status-0002',
      action: 'STATUS',
      status: 'open',
      snoozedUntil: 1_800_000_000,
    })).toThrow('Invalid Unified Inbox status action');

    expect(() => parseUnifiedInboxConversationActionBody(CONVERSATION_ID, {
      requestId: 'req-team-0001',
      action: 'TEAM',
      teamId: 'not-a-uuid',
    })).toThrow('Invalid Unified Inbox team action');
  });

  it('maps mutations to pinned Chatwoot v4.18 account endpoints', () => {
    expect(mutationRequestForUnifiedInboxAction(42, {
      kind: 'STATUS',
      status: 'resolved',
      snoozedUntil: null,
    })).toEqual({
      resourcePath: '/conversations/42/toggle_status',
      body: { status: 'resolved' },
    });

    expect(mutationRequestForUnifiedInboxAction(42, {
      kind: 'LABELS',
      labels: ['sales', 'vip'],
    })).toEqual({
      resourcePath: '/conversations/42/labels',
      body: { labels: ['sales', 'vip'] },
    });

    expect(mutationRequestForUnifiedInboxAction(42, {
      kind: 'ASSIGNEE',
      chatwootUserId: null,
      smartUserId: null,
    })).toEqual({
      resourcePath: '/conversations/42/assignments',
      body: { assignee_id: null },
    });

    expect(mutationRequestForUnifiedInboxAction(42, {
      kind: 'TEAM',
      chatwootTeamId: null,
      teamId: null,
    })).toEqual({
      resourcePath: '/conversations/42/assignments',
      body: { team_id: 0 },
    });
  });

  it('requires exact reconciled state', () => {
    const external = {
      status: 'open',
      snoozedUntil: null,
      labels: ['sales', 'vip'],
      assigneeId: 71,
      teamId: '91',
    };

    expect(externalConversationMatchesTarget(external, {
      kind: 'STATUS',
      status: 'open',
      snoozedUntil: null,
    })).toBe(true);
    expect(externalConversationMatchesTarget({
      ...external,
      status: 'snoozed',
      snoozedUntil: 1_800_000_000,
    }, {
      kind: 'STATUS',
      status: 'snoozed',
      snoozedUntil: 1_800_000_000,
    })).toBe(true);
    expect(externalConversationMatchesTarget(external, {
      kind: 'LABELS',
      labels: ['sales', 'vip'],
    })).toBe(true);
    expect(externalConversationMatchesTarget(external, {
      kind: 'ASSIGNEE',
      chatwootUserId: 72,
      smartUserId: '00000000-0000-4000-8000-000000009802',
    })).toBe(false);
    expect(externalConversationMatchesTarget(external, {
      kind: 'TEAM',
      chatwootTeamId: '91',
      teamId: '50000000-0000-4000-8000-000000009810',
    })).toBe(true);
  });
});
