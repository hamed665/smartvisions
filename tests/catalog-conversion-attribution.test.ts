import { describe, expect, it } from 'vitest';
import { buildCatalogConversionAttribution } from '@/lib/reports/catalog-conversion';

const t = (minute: number) => `2026-09-07T10:${String(minute).padStart(2, '0')}:00.000Z`;

function product(input: { id: string; contentId: string; lead?: string; conversation?: string; minute: number }) {
  return {
    provider_message_id: input.id,
    lead_id: input.lead ?? 'lead-1',
    conversation_id: input.conversation ?? 'conv-1',
    direction: 'OUTBOUND',
    event_type: 'PRODUCT_SENT',
    payload: { catalog_content_id: input.contentId },
    created_at: t(input.minute),
  };
}

function status(id: string, eventType: string, minute: number) {
  return {
    provider_message_id: id,
    direction: 'STATUS',
    event_type: eventType,
    created_at: t(minute),
  };
}

function inbound(input: { id: string; lead?: string; conversation?: string; minute: number }) {
  return {
    id: input.id,
    lead_id: input.lead ?? 'lead-1',
    channel: 'WHATSAPP',
    direction: 'INBOUND',
    status: 'RECEIVED',
    received_at: t(input.minute),
    metadata: { conversation_id: input.conversation ?? 'conv-1' },
  };
}

const emptyInput = {
  whatsappEvents: [],
  inboundMessages: [],
  handoffEvents: [],
  leads: [],
};

describe('catalog conversion attribution', () => {
  it('returns the complete seven-item catalog even before sends exist', () => {
    const result = buildCatalogConversionAttribution(emptyInput);
    expect(result.sent).toBe(0);
    expect(result.rows).toHaveLength(7);
    expect(result.rows.map((row) => row.contentId)).toContain('SV-BIZ-AUTO-001');
    expect(result.rows.every((row) => row.replyRate === null)).toBe(true);
  });

  it('correlates delivery and read status by exact provider message id', () => {
    const result = buildCatalogConversionAttribution({
      ...emptyInput,
      whatsappEvents: [
        product({ id: 'wamid-product-1', contentId: 'SV-WA-001', minute: 1 }),
        status('wamid-product-1', 'DELIVERED', 2),
        status('wamid-product-1', 'READ', 3),
        status('other-message', 'READ', 4),
      ],
    });
    const row = result.rows.find((item) => item.contentId === 'SV-WA-001')!;
    expect(row).toMatchObject({ sent: 1, delivered: 1, read: 1 });
  });

  it('treats READ as delivered even when the DELIVERED webhook is absent', () => {
    const result = buildCatalogConversionAttribution({
      ...emptyInput,
      whatsappEvents: [
        product({ id: 'wamid-product-1', contentId: 'SV-SEO-001', minute: 1 }),
        status('wamid-product-1', 'READ', 3),
      ],
    });
    const row = result.rows.find((item) => item.contentId === 'SV-SEO-001')!;
    expect(row.delivered).toBe(1);
    expect(row.read).toBe(1);
  });

  it('attributes a customer reply only to the latest prior product in the same conversation', () => {
    const result = buildCatalogConversionAttribution({
      ...emptyInput,
      whatsappEvents: [
        product({ id: 'p1', contentId: 'SV-WEB-001', minute: 1 }),
        product({ id: 'p2', contentId: 'SV-WA-001', minute: 5 }),
      ],
      inboundMessages: [inbound({ id: 'in-1', minute: 8 })],
    });
    expect(result.rows.find((row) => row.contentId === 'SV-WEB-001')?.replied).toBe(0);
    expect(result.rows.find((row) => row.contentId === 'SV-WA-001')?.replied).toBe(1);
  });

  it('does not attribute inbound messages that happened before the product send', () => {
    const result = buildCatalogConversionAttribution({
      ...emptyInput,
      whatsappEvents: [product({ id: 'p1', contentId: 'SV-WEB-001', minute: 10 })],
      inboundMessages: [inbound({ id: 'in-1', minute: 2 })],
    });
    expect(result.replied).toBe(0);
  });

  it('does not cross conversation boundaries even for the same lead', () => {
    const result = buildCatalogConversionAttribution({
      ...emptyInput,
      whatsappEvents: [product({ id: 'p1', contentId: 'SV-WEB-001', conversation: 'conv-a', minute: 1 })],
      inboundMessages: [inbound({ id: 'in-1', conversation: 'conv-b', minute: 5 })],
    });
    expect(result.replied).toBe(0);
  });

  it('attributes a HUMAN handoff to the latest prior catalog send in that conversation', () => {
    const result = buildCatalogConversionAttribution({
      ...emptyInput,
      whatsappEvents: [
        product({ id: 'p1', contentId: 'SV-IG-CONTENT-001', minute: 1 }),
        product({ id: 'p2', contentId: 'SV-SM-001', minute: 4 }),
      ],
      handoffEvents: [{
        lead_id: 'lead-1',
        conversation_id: 'conv-1',
        to_mode: 'HUMAN',
        created_at: t(7),
      }],
    });
    expect(result.rows.find((row) => row.contentId === 'SV-IG-CONTENT-001')?.handoff).toBe(0);
    expect(result.rows.find((row) => row.contentId === 'SV-SM-001')?.handoff).toBe(1);
  });

  it('attributes each currently WON lead once to its latest catalog send', () => {
    const result = buildCatalogConversionAttribution({
      ...emptyInput,
      whatsappEvents: [
        product({ id: 'p1', contentId: 'SV-WEB-001', lead: 'lead-won', minute: 1 }),
        product({ id: 'p2', contentId: 'SV-SEO-001', lead: 'lead-won', minute: 5 }),
      ],
      leads: [{ id: 'lead-won', status: 'WON' }],
    });
    expect(result.won).toBe(1);
    expect(result.rows.find((row) => row.contentId === 'SV-WEB-001')?.won).toBe(0);
    expect(result.rows.find((row) => row.contentId === 'SV-SEO-001')?.won).toBe(1);
  });

  it('ignores unknown or incomplete product events instead of inventing attribution', () => {
    const result = buildCatalogConversionAttribution({
      ...emptyInput,
      whatsappEvents: [
        product({ id: 'unknown', contentId: 'SV-NOT-REAL', minute: 1 }),
        {
          provider_message_id: 'missing-linkage',
          direction: 'OUTBOUND',
          event_type: 'PRODUCT_SENT',
          payload: { catalog_content_id: 'SV-WA-001' },
          created_at: t(2),
        },
      ],
    });
    expect(result.sent).toBe(0);
  });

  it('counts multiple customer messages after one product as one replied product send', () => {
    const result = buildCatalogConversionAttribution({
      ...emptyInput,
      whatsappEvents: [product({ id: 'p1', contentId: 'SV-AI-AGENT-001', minute: 1 })],
      inboundMessages: [
        inbound({ id: 'in-1', minute: 3 }),
        inbound({ id: 'in-2', minute: 4 }),
      ],
    });
    const row = result.rows.find((item) => item.contentId === 'SV-AI-AGENT-001')!;
    expect(row.sent).toBe(1);
    expect(row.replied).toBe(1);
    expect(row.replyRate).toBe(100);
  });

  it('does not expose a fabricated click metric', () => {
    const result = buildCatalogConversionAttribution(emptyInput);
    expect('clicked' in result).toBe(false);
    expect(result.rows.every((row) => !('clicked' in row))).toBe(true);
  });
});
