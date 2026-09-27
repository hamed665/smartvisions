import { describe, expect, it, vi } from 'vitest';
import { reconcileInstagramReceipt } from '@/lib/instagram/reconciliation';

const route = {
  organizationId: 'org-1',
  tenantBusinessId: 'tb-1',
  branchId: 'branch-1',
  bindingId: 'binding-1',
  integrationConnectionId: 'ic-1',
  destinationId: 'ig-business-1',
  providerAccountId: null,
};

describe('Instagram receipt reconciliation', () => {
  it('reconciles each exact delivered provider message id', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ message_id: 'm', delivery_status: 'DELIVERED', changed: true }], error: null });
    const result = await reconcileInstagramReceipt({
      service: { rpc },
      route,
      event: {
        providerEventId: 'evt-1',
        destinationId: 'ig-business-1',
        eventType: 'DELIVERY',
        payload: { delivery: { mids: ['mid-1', 'mid-2'] } },
      },
    });
    expect(result).toEqual({ reconciled: 2, unmatched: 0, skipped: false });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('reconcile_instagram_message_receipt', expect.objectContaining({ p_provider_message_id: 'mid-1', p_receipt_type: 'DELIVERY' }));
  });

  it('journals but does not guess a read receipt without an exact message id', async () => {
    const rpc = vi.fn();
    const result = await reconcileInstagramReceipt({
      service: { rpc },
      route,
      event: {
        providerEventId: 'evt-2',
        destinationId: 'ig-business-1',
        eventType: 'READ',
        payload: { read: { watermark: 1700000000000 } },
      },
    });
    expect(result.skipped).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports an exact receipt that has no canonical outbound message as unmatched', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const result = await reconcileInstagramReceipt({
      service: { rpc },
      route,
      event: {
        providerEventId: 'evt-3',
        destinationId: 'ig-business-1',
        eventType: 'READ',
        payload: { read: { mid: 'mid-3' } },
      },
    });
    expect(result).toEqual({ reconciled: 0, unmatched: 1, skipped: false });
  });
});
