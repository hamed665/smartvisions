import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(), scope: vi.fn(), resolve: vi.fn(), gate: vi.fn(), upload: vi.fn(), audio: vi.fn(),
  mirror: vi.fn(), record: vi.fn(), replay: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/access/customer-studio', () => ({ isStudioRequestOrigin: () => true, studioOwnerThread: mocks.scope }));
vi.mock('@/lib/supabase/org', () => ({ getCurrentOrganization: vi.fn() }));
vi.mock('@/lib/whatsapp/tenant-routing', () => ({ resolveMetaWhatsAppProvider: mocks.resolve }));
vi.mock('@/lib/outreach/canonical-send-gate', () => ({ assertCanonicalSendAllowed: mocks.gate, normalizeCanonicalPhone: (phone: string) => phone }));
vi.mock('@/lib/reliability/cost-guard', () => ({ getCostGuardState: vi.fn(), assertPaidOperationAllowed: vi.fn(), recordUsage: mocks.record }));
vi.mock('@/lib/chatwoot/conversation-actions', () => ({ mirrorCanonicalWhatsAppOutboundToChatwoot: mocks.mirror }));
vi.mock('@/lib/whatsapp/lifecycle', () => ({ replayPersistedWhatsAppStatuses: mocks.replay }));

import { POST } from '@/app/api/conversations/[id]/owner-reply/route';

const business = '11111111-1111-4111-8111-111111111111';
const thread = '22222222-2222-4222-8222-222222222222';
const bytes = Uint8Array.from([0xff, 0xfb, ...Array<number>(40).fill(0)]);
const updates: Record<string, unknown>[] = [];
let prior: Record<string, unknown> | null;

function fakeQuery(table: string) {
  const select = async () => {
    const rows: Record<string, unknown> = {
      conversation_messages: prior,
      sales_conversations: { id: thread, lead_id: 'lead', channel: 'WHATSAPP', stage: 'ACTIVE', agent_mode: 'HUMAN', requires_human: true },
      leads: { id: 'lead', business_id: 'customer', status: 'REPLIED', agent_mode: 'HUMAN' },
      businesses: { whatsapp: '96800000000', phone: '' },
      integration_connections: { enabled: true, status: 'CONNECTED' },
      unified_inbox_conversation_projections: { tenant_business_id: business, branch_id: 'branch', communication_channel_binding_id: 'binding' },
    };
    return { data: rows[table] ?? null, error: null };
  };
  const query = {
    select: () => query,
    eq: () => query,
    contains: () => query,
    limit: () => query,
    in: () => query,
    maybeSingle: select,
    single: async () => ({ data: { id: 'claim' }, error: null }),
    insert: () => query,
    update: (values: Record<string, unknown>) => { if (table === 'conversation_messages') updates.push(values); return query; },
    upsert: () => query,
    then: (resolve: (result: { error: null }) => void) => Promise.resolve({ error: null }).then(resolve),
  };
  return query;
}

function request() {
  return POST(new Request('https://studio.example/api/reply?businessId='+business+'&requestId=request-fixture', {
    method: 'POST', headers: { 'Content-Type': 'audio/mpeg' }, body: bytes,
  }), { params: Promise.resolve({ id: thread }) });
}

describe('Owner audio reply through the canonical provider gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.example');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'fixture-secret');
    updates.length = 0;
    prior = null;
    mocks.from.mockImplementation(fakeQuery);
    mocks.scope.mockResolvedValue({ organizationId: 'organization', userId: 'owner' });
    mocks.gate.mockResolvedValue({ whatsappPolicy: { allowed: true, mode: 'FREEFORM' } });
    mocks.resolve.mockResolvedValue({ bindingId: 'binding', phoneNumberId: 'phone', accessToken: 'test', provider: {
      uploadAudio: mocks.upload, sendAudio: mocks.audio,
    } });
    mocks.upload.mockResolvedValue({ mediaId: '1234' });
    mocks.audio.mockResolvedValue({ providerMessageId: 'wamid.fixture' });
  });

  it('uploads the original bytes and checks safety again before sending the provider media id', async () => {
    const result = await request();
    expect(result.status).toBe(200);
    expect(new Uint8Array(mocks.upload.mock.calls[0][0].bytes)).toEqual(bytes);
    expect(mocks.gate).toHaveBeenCalledTimes(3);
    expect(mocks.gate.mock.invocationCallOrder[2]).toBeLessThan(mocks.audio.mock.invocationCallOrder[0]);
    expect(mocks.audio).toHaveBeenCalledWith({ to: '96800000000', mediaId: '1234' });
    expect(updates.at(-1)).toMatchObject({ status: 'SENT', provider_delivery_status: 'ACCEPTED' });
  });

  it('blocks dispatch if safety changes during upload', async () => {
    mocks.gate.mockResolvedValueOnce({ whatsappPolicy: { allowed: true, mode: 'FREEFORM' } });
    mocks.gate.mockResolvedValueOnce({ whatsappPolicy: { allowed: true, mode: 'FREEFORM' } });
    mocks.gate.mockRejectedValueOnce(new Error('DNC'));
    expect((await request()).status).toBe(409);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.audio).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ status: 'FAILED' });
  });

  it('leaves a provider timeout for reconciliation and never replays the same claim', async () => {
    mocks.audio.mockRejectedValueOnce(new Error('timeout'));
    const result = await request();
    expect(await result.json()).toMatchObject({ retryPolicy: 'RECONCILIATION_ONLY', messageId: 'claim' });
    expect(updates.some(row => row.status === 'FAILED')).toBe(false);
    prior = { id: 'claim', status: 'PROCESSING' };
    const replay = await request();
    expect(await replay.json()).toMatchObject({ replayed: true, status: 'PROCESSING' });
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.audio).toHaveBeenCalledOnce();
  });
});
