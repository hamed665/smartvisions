import { describe, expect, it } from 'vitest';
import {
  evaluateCanonicalSendSafety,
  latestInboundTimestamp,
  normalizeCanonicalEmail,
  normalizeCanonicalPhone,
} from '@/lib/outreach/canonical-send-gate';
import { evaluateWhatsAppSendPolicy } from '@/lib/whatsapp/policy';

const base = {
  channel: 'EMAIL' as const,
  globalKillSwitch: false,
  channelPaused: false,
  agentsPaused: false,
  shadowMode: false,
  leadStatus: 'QUALIFIED',
  leadAgentMode: 'AUTO',
  conversationStage: 'ACTIVE',
  conversationAgentMode: 'AUTO',
  conversationRequiresHuman: false,
  recipientMatchesCanonicalBusiness: true,
  suppressed: false,
  marketWindowAllowed: true,
};

describe('canonical send safety', () => {
  it('allows only a fully clear canonical snapshot', () => {
    expect(evaluateCanonicalSendSafety(base)).toEqual({ allowed: true, blocks: [] });
  });

  it('blocks DNC even when a message was approved earlier', () => {
    const result = evaluateCanonicalSendSafety({ ...base, leadStatus: 'DO_NOT_CONTACT' });
    expect(result.allowed).toBe(false);
    expect(result.blocks).toContain('DO_NOT_CONTACT');
  });

  it('blocks a kill switch flip at the provider boundary', () => {
    const result = evaluateCanonicalSendSafety({ ...base, globalKillSwitch: true });
    expect(result.blocks).toContain('GLOBAL_KILL_SWITCH');
  });

  it('blocks human takeover, paused conversations, suppression and recipient drift', () => {
    const result = evaluateCanonicalSendSafety({
      ...base,
      conversationRequiresHuman: true,
      conversationStage: 'PAUSED',
      suppressed: true,
      recipientMatchesCanonicalBusiness: false,
    });
    expect(result.blocks).toEqual(expect.arrayContaining([
      'HUMAN_TAKEOVER',
      'AGENT_PAUSED',
      'SUPPRESSED_RECIPIENT',
      'RECIPIENT_MISMATCH',
    ]));
  });

  it('keeps shadow mode fail-closed except for a separately verified exception', () => {
    expect(evaluateCanonicalSendSafety({ ...base, shadowMode: true }).blocks).toContain('SHADOW_MODE_ENABLED');
    expect(evaluateCanonicalSendSafety({ ...base, shadowMode: true, shadowModeExceptionVerified: true }).allowed).toBe(true);
  });

  it('allows a verified owner manual send only while full human takeover is still active', () => {
    const result = evaluateCanonicalSendSafety({
      ...base,
      channel: 'WHATSAPP',
      shadowMode: true,
      ownerManualSendVerified: true,
      leadAgentMode: 'HUMAN',
      conversationAgentMode: 'HUMAN',
      conversationRequiresHuman: true,
      whatsappPolicyAllowed: true,
    });
    expect(result).toEqual({ allowed: true, blocks: [] });
  });

  it('fails owner manual send closed if takeover was released before the final boundary', () => {
    const result = evaluateCanonicalSendSafety({
      ...base,
      channel: 'WHATSAPP',
      shadowMode: true,
      ownerManualSendVerified: true,
      whatsappPolicyAllowed: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.blocks).toContain('OWNER_MANUAL_REQUIRES_HUMAN_TAKEOVER');
  });

  it('never lets the owner manual exception bypass core safety gates', () => {
    const result = evaluateCanonicalSendSafety({
      ...base,
      channel: 'WHATSAPP',
      shadowMode: true,
      ownerManualSendVerified: true,
      leadAgentMode: 'HUMAN',
      conversationAgentMode: 'HUMAN',
      conversationRequiresHuman: true,
      globalKillSwitch: true,
      channelPaused: true,
      agentsPaused: true,
      leadStatus: 'DO_NOT_CONTACT',
      suppressed: true,
      recipientMatchesCanonicalBusiness: false,
      marketWindowAllowed: false,
      whatsappPolicyAllowed: false,
    });
    expect(result.blocks).toEqual(expect.arrayContaining([
      'GLOBAL_KILL_SWITCH',
      'CHANNEL_PAUSED',
      'AGENTS_PAUSED',
      'DO_NOT_CONTACT',
      'SUPPRESSED_RECIPIENT',
      'RECIPIENT_MISMATCH',
      'OUTSIDE_CANONICAL_MARKET_WINDOW',
      'WHATSAPP_24H_POLICY',
    ]));
    expect(result.blocks).not.toContain('SHADOW_MODE_ENABLED');
    expect(result.blocks).not.toContain('HUMAN_TAKEOVER');
  });

  it('blocks an invalid canonical WhatsApp policy', () => {
    const result = evaluateCanonicalSendSafety({ ...base, channel: 'WHATSAPP', whatsappPolicyAllowed: false });
    expect(result.blocks).toContain('WHATSAPP_24H_POLICY');
  });

  it('normalizes recipients before canonical comparison', () => {
    expect(normalizeCanonicalEmail(' Sales@Example.COM ')).toBe('sales@example.com');
    expect(normalizeCanonicalPhone('+968 9123-4567')).toBe('96891234567');
  });
});

describe('durable WhatsApp inbound selection', () => {
  it('uses the durable outreach ledger when the conversation copy is missing', () => {
    expect(latestInboundTimestamp(null, '2026-09-05T09:36:32+00:00')).toBe('2026-09-05T09:36:32.000Z');
  });

  it('uses the newest valid inbound across both ledgers', () => {
    expect(latestInboundTimestamp(
      '2026-09-05T09:00:00.000Z',
      '2026-09-05T09:36:32.000Z',
    )).toBe('2026-09-05T09:36:32.000Z');
  });

  it('fails closed when neither ledger has a valid timestamp', () => {
    expect(latestInboundTimestamp(null, undefined, 'not-a-date')).toBeNull();
  });
});

describe('WhatsApp exact 24-hour boundary', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');

  it('allows free-form just inside 24 hours', () => {
    const result = evaluateWhatsAppSendPolicy({
      lastCustomerMessageAt: new Date(now.getTime() - (24 * 60 * 60 * 1000) + 1),
      now,
    });
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe('FREEFORM');
  });

  it('blocks free-form at exactly 24 hours and requires a template', () => {
    const result = evaluateWhatsAppSendPolicy({
      lastCustomerMessageAt: new Date(now.getTime() - (24 * 60 * 60 * 1000)),
      now,
    });
    expect(result.allowed).toBe(false);
    expect(result.mode).toBe('BLOCK');
  });
});
