import { describe, expect, it, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  telegram: { organizationId: 'owner-org' } as { organizationId: string } | null,
  send: vi.fn(async (_request: Record<string, unknown>) => { void _request; return { sent: true }; }),
}));
vi.mock('@/lib/telegram/config', () => ({ getTelegramRuntimeConfig: () => state.telegram }));
vi.mock('@/lib/operations/alerts', () => ({ notifyOperationalAlert: state.send }));

import { alertOnUnansweredWhatsApp } from '@/lib/operations/unanswered-whatsapp';

const now = new Date('2026-10-14T12:00:00Z');
const realInbound = {
  id: 'inbound-a', organization_id: 'owner-org', conversation_id: 'conv-a',
  lead_id: 'lead-a', provider_message_id: 'wamid.real', created_at: '2026-10-14T11:40:00Z',
};

function db(input: { latest?: typeof realInbound[]; sent?: boolean; stage?: string; failure?: boolean }) {
  const calls: Array<{ table: string; filters: Record<string, string> }> = [];
  const supabase = {
    from(table: string) {
      const filters: Record<string, string> = {};
      calls.push({ table, filters });
      const resolve = () => {
        if (input.failure) return { data: null, error: { message: 'DB error' } };
        if (table === 'sales_conversations') return {
          data: { id: 'conv-a', lead_id: 'lead-a', channel: 'WHATSAPP', stage: input.stage ?? 'ACTIVE', agent_mode: 'AUTO', requires_human: false }, error: null,
        };
        if (filters.direction === 'OUTBOUND') return {
          data: input.sent ? { id: 'provider-accepted-outbound' } : null, error: null,
        };
        return { data: input.latest ?? [realInbound], error: null };
      };
      const chain = {
        select() { return this; },
        eq(key: string, value: string) { filters[key] = value; return this; },
        gte() { return this; },
        lte() { return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle() { return Promise.resolve(resolve()); },
        then(fulfill: (result: ReturnType<typeof resolve>) => unknown) {
          return Promise.resolve(resolve()).then(fulfill);
        },
      };
      return chain;
    },
  };
  return { client: supabase as never, calls };
}

describe('owner-only, read-only WhatsApp no-response watch', () => {
  beforeEach(() => {
    state.telegram = { organizationId: 'owner-org' };
    state.send.mockClear();
  });
  it('alerts owner exactly once for unresponded real inbound; never sends to customer', async () => {
    const { client, calls } = db({});
    expect(await alertOnUnansweredWhatsApp(client, now)).toEqual({ examined: 1, alerted: 1, failed: 0 });
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.send.mock.calls[0][0]).toMatchObject({
      organizationId: 'owner-org',
      code: 'CUSTOMER_UNANSWERED',
      eventKey: 'unanswered-wa:inbound-a',
      entityType: 'conversation',
      entityId: 'conv-a',
    });
    expect(calls[0].filters.organization_id).toBe('owner-org');
    expect(calls.some((call) => call.filters.direction === 'OUTBOUND' && call.filters.status === 'SENT')).toBe(true);
  });
  it('does not alert when customer already got a SENT reply', async () => {
    const { client } = db({ sent: true });
    expect(await alertOnUnansweredWhatsApp(client, now)).toEqual({ examined: 1, alerted: 0, failed: 0 });
    expect(state.send).not.toHaveBeenCalled();
  });
  it('does not notify another tenant or spam recipients', async () => {
    const { client } = db({ latest: [{ ...realInbound, organization_id: 'another-org' }] });
    expect(await alertOnUnansweredWhatsApp(client, now)).toEqual({ examined: 0, alerted: 0, failed: 0 });
    expect(state.send).not.toHaveBeenCalled();
  });
  it('does not alert DNC conversations or recent inbound under eight minutes', async () => {
    for (const input of [
      { stage: 'DO_NOT_CONTACT' },
      { latest: [{ ...realInbound, created_at: '2026-10-14T11:58:00Z' }] },
    ]) {
      const { client } = db(input);
      expect((await alertOnUnansweredWhatsApp(client, now)).alerted).toBe(0);
    }
    expect(state.send).not.toHaveBeenCalled();
  });
  it('reports absent owner notification setup without leaking to any org', async () => {
    state.telegram = null;
    const { client, calls } = db({});
    expect(await alertOnUnansweredWhatsApp(client, now)).toEqual({ examined: 0, alerted: 0, failed: 1 });
    expect(calls).toHaveLength(0);
  });
});
