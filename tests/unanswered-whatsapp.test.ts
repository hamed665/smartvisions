import { describe, expect, it } from 'vitest';
import { unansweredWhatsAppCandidate, WHATSAPP_UNANSWERED_AFTER_MINUTES } from '@/lib/operations/unanswered-whatsapp';

const now = new Date('2026-10-14T11:00:00.000Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

describe('canonical unanswered WhatsApp escalation', () => {
  it('alerts after the 8 minute threshold when no newer outbound is projected', () => {
    expect(WHATSAPP_UNANSWERED_AFTER_MINUTES).toBe(8);
    expect(unansweredWhatsAppCandidate({ now, lastInboundAt: ago(9) })).toBe(true);
    expect(unansweredWhatsAppCandidate({ now, lastInboundAt: ago(7) })).toBe(false);
    // Projection timestamps can reflect queued drafts; only the SENT ledger is authoritative.
  });
  it('does not revive suppressed or historical conversations', () => {
    expect(unansweredWhatsAppCandidate({ now, lastInboundAt: ago(9), stage: 'SPAM' })).toBe(false);
    expect(unansweredWhatsAppCandidate({ now, lastInboundAt: ago(9), stage: 'DO_NOT_CONTACT' })).toBe(false);
    expect(unansweredWhatsAppCandidate({ now, lastInboundAt: ago(24*60 + 5) })).toBe(false);
    expect(unansweredWhatsAppCandidate({ now, lastInboundAt: 'bad-date' })).toBe(false);
  });
  it('uses provider-sent ledger and stable inbound IDs without customer send code', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(path.join(process.cwd(), 'lib/operations/unanswered-whatsapp.ts'), 'utf8');
    expect(source).toContain(".eq('provenance', 'CUSTOMER')");
    expect(source).toContain(".from('conversation_messages')");
    expect(source).toContain(".eq('organization_id', telegram.organizationId)");
    expect(source).not.toContain(".gte('last_inbound_at'");
    expect(source).toContain(".eq('source_plane', 'META_WHATSAPP')");
    expect(source).toContain(".eq('status', 'SENT')");
    expect(source).toContain(".gte('sent_at', inbound.created_at)");
    expect(source).toContain("eventKey: 'unanswered-wa:' + inbound.id");
    expect(source).not.toMatch(/approvedSendPost|queueShadowDraft|sendWhatsAppMessage/);
  });
});
