import { describe, expect, it } from 'vitest';
import { whatsappPilotRequestKey } from '@/lib/whatsapp/pilot';
import { normalizeIdempotencyKey } from '@/lib/agents/idempotency';

describe('WhatsApp controlled pilot idempotency', () => {
  it('derives a canonical safe key from the durable inbound UUID', () => {
    const inboundId = '7f6a7a3d-2f5f-4f0f-8dd0-3f79bb3a8d1c';
    const key = whatsappPilotRequestKey(inboundId);

    expect(key).toBe(`whatsapp-pilot:${inboundId}`);
    expect(normalizeIdempotencyKey(key)).toBe(key);
  });

  it('does not depend on Meta provider message IDs that may contain unsupported characters', () => {
    const metaProviderMessageId = 'wamid.HBgMOTY4OTk5OTk5OTk5FQIAERgSRTQ2N0FCQ0RFRjEyMzQ1NgA=';

    expect(() => normalizeIdempotencyKey(`whatsapp-pilot:${metaProviderMessageId}`)).toThrow(
      'idempotencyKey contains unsupported characters',
    );
    expect(() => whatsappPilotRequestKey('7f6a7a3d-2f5f-4f0f-8dd0-3f79bb3a8d1c')).not.toThrow();
  });
});
