import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), lifecycle: vi.fn() }));
vi.mock('@/lib/whatsapp/tenant-routing', () => ({
  resolveMetaWhatsAppDestination: mocks.resolve,
  resolveMetaWhatsAppProvider: vi.fn(),
}));
vi.mock('@/lib/whatsapp/lifecycle', () => ({
  applyWhatsAppInboundLifecycle: mocks.lifecycle,
}));
import { recoverSahraUnlinkedInbound } from '@/lib/whatsapp/chatwoot-inbound-sync';
import { SAHRA_FAST_SCOPE } from '@/lib/whatsapp/sahra-fast-inbound-core';

const at = Date.parse('2026-10-14T15:25:00Z');
const event = {
  providerMessageId: 'wamid.real-meta-evidence',
  destination: { phoneNumberId: '1407399779117822', wabaId: '1871092380723444' },
  from: '96878483236', timestamp: '1791990230',
  type: 'text', text: 'في شاشات اندرويد؟',
};
const route = {
  organizationId: SAHRA_FAST_SCOPE.organizationId,
  tenantBusinessId: SAHRA_FAST_SCOPE.tenantBusinessId,
  bindingId: SAHRA_FAST_SCOPE.bindingId,
  branchId: null,
  integrationConnectionId: '1812c00a-9ec0-4c81-97c3-2a529f55f691',
  phoneNumberId: event.destination.phoneNumberId, wabaId: event.destination.wabaId,
};
const input = {
  service: {} as SupabaseClient,
  row: {
    organization_id: SAHRA_FAST_SCOPE.organizationId,
    provider_message_id: event.providerMessageId,
    created_at: '2026-10-14T15:03:50Z',
    lead_id: null, conversation_id: null,
  },
  event,
  routing: {
    tenantBusinessId: route.tenantBusinessId,
    bindingId: route.bindingId,
    phoneNumberId: route.phoneNumberId,
    branchId: null,
    integrationConnectionId: route.integrationConnectionId,
  },
  now: at,
};
beforeEach(() => {
  mocks.resolve.mockReset();
  mocks.lifecycle.mockReset();
  mocks.resolve.mockResolvedValue(route);
  mocks.lifecycle.mockResolvedValue({
    linked: true, leadId: 'existing-from-real-inbound', businessId: 'same-business',
    identityId: 'verified-identity', conversationId: 'canonical-conversation',
    messageId: 'canonical-message',
  });
});
describe('Sahra signed journal recovery after CRM lead provenance regression', () => {
  it('relinks a narrowly scoped historical real inbound into canonical history without AI or provider sends', async () => {
    const linked = await recoverSahraUnlinkedInbound(input);
    expect(linked?.linked).toBe(true);
    expect(mocks.resolve).toHaveBeenCalledWith({
      service: input.service, destination: event.destination,
    });
    expect(mocks.lifecycle).toHaveBeenCalledTimes(1);
    expect(mocks.lifecycle).toHaveBeenCalledWith(
      SAHRA_FAST_SCOPE.organizationId,
      event,
      expect.objectContaining({
        tenantBusinessId: SAHRA_FAST_SCOPE.tenantBusinessId,
        bindingId: SAHRA_FAST_SCOPE.bindingId,
      }),
    );
  });

  it.each([
    [{ row: { ...input.row, organization_id: 'other-org' } }, 'other organization'],
    [{ row: { ...input.row, lead_id: 'already-claimed' } }, 'already linked lead'],
    [{ row: { ...input.row, conversation_id: 'existing-conversation' } }, 'already linked conversation'],
    [{ row: { ...input.row, provider_message_id: 'different-id' } }, 'forged message id'],
    [{ routing: { ...input.routing, tenantBusinessId: 'different-tenant' } }, 'other business'],
    [{ routing: { ...input.routing, bindingId: 'different-binding' } }, 'other WhatsApp channel'],
    [{ row: { ...input.row, created_at: '2026-10-13T01:00:00Z' } }, 'older than one day'],
    [{ row: { ...input.row, created_at: '2026-10-14T15:24:50Z' } }, 'fresh inbound must use live webhook path'],
    [{ event: { ...event, type: 'unsupported' } }, 'unrecognized message type'],
  ])('rejects %s: %s', async (override) => {
    expect(await recoverSahraUnlinkedInbound({ ...input, ...override })).toBeNull();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.lifecycle).not.toHaveBeenCalled();
  });

  it('fails closed when signed journal routing and current binding differ', async () => {
    mocks.resolve.mockResolvedValueOnce({ ...route, bindingId: 'other-binding' });
    expect(await recoverSahraUnlinkedInbound(input)).toBeNull();
    expect(mocks.lifecycle).not.toHaveBeenCalled();
  });

  it('never invokes lifecycle if integration connection or phone-number identity drifts', async () => {
    mocks.resolve.mockResolvedValueOnce({ ...route, integrationConnectionId: 'different-connection' });
    expect(await recoverSahraUnlinkedInbound(input)).toBeNull();
    expect(mocks.lifecycle).not.toHaveBeenCalled();
  });
});
