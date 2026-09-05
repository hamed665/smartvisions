import { describe, expect, it } from 'vitest';
import {
  resolveControlledPilotGrowthOsBaseUrl,
  verifyControlledWhatsAppPilot,
} from '@/lib/outreach/controlled-whatsapp-pilot';

const base = {
  messageStatus: 'APPROVED',
  requiresApproval: false,
  channel: 'WHATSAPP',
  metadataSource: 'SHADOW_MODE',
  providerMessageId: 'shadow:agent:whatsapp-pilot:36c143b0-dd7a-4e4a-9aaa-8e708ebc601f:shadow',
  idempotencyKey: 'agent:whatsapp-pilot:36c143b0-dd7a-4e4a-9aaa-8e708ebc601f:shadow',
  catalogContentId: 'SV-WEB-001',
  sendTo: '96877511053',
  messageLeadId: 'lead-1',
  conversationLeadId: 'lead-1',
  conversationChannel: 'WHATSAPP',
  businessCategory: 'INTERNAL_TEST',
  businessWhatsapp: '+968 7751 1053',
  businessPhone: null,
};

describe('controlled WhatsApp pilot verification', () => {
  it('accepts the owner-approved internal test catalog artifact', () => {
    expect(verifyControlledWhatsAppPilot(base)).toEqual({
      verified: true,
      mode: 'CATALOG',
      catalogContentId: 'SV-WEB-001',
      recipient: '96877511053',
    });
  });

  it('accepts an owner-approved INTERNAL_TEST text reply without a catalog id', () => {
    expect(verifyControlledWhatsAppPilot({ ...base, catalogContentId: null })).toEqual({
      verified: true,
      mode: 'TEXT',
      catalogContentId: null,
      recipient: '96877511053',
    });
  });

  it('still requires owner approval for text pilot sends', () => {
    expect(verifyControlledWhatsAppPilot({
      ...base,
      catalogContentId: null,
      messageStatus: 'APPROVAL_REQUIRED',
      requiresApproval: true,
    })).toEqual({
      verified: false,
      reason: 'MESSAGE_NOT_OWNER_APPROVED',
    });
  });

  it('rejects a request flag without canonical shadow provenance', () => {
    expect(verifyControlledWhatsAppPilot({ ...base, providerMessageId: 'wamid.external' })).toEqual({
      verified: false,
      reason: 'SHADOW_PROVIDER_ID_MISMATCH',
    });
  });

  it('rejects generic Agent shadow drafts that were not created by the controlled pilot path', () => {
    expect(verifyControlledWhatsAppPilot({
      ...base,
      catalogContentId: null,
      idempotencyKey: 'agent:whatsapp:some-normal-agent-run:shadow',
      providerMessageId: 'shadow:agent:whatsapp:some-normal-agent-run:shadow',
    })).toEqual({
      verified: false,
      reason: 'IDEMPOTENCY_KEY_NOT_CONTROLLED_PILOT',
    });
  });

  it('rejects non-internal businesses and recipient mismatches for text and catalog', () => {
    expect(verifyControlledWhatsAppPilot({ ...base, catalogContentId: null, businessCategory: 'DENTAL' }).verified).toBe(false);
    expect(verifyControlledWhatsAppPilot({ ...base, businessWhatsapp: '+968 9999 9999' })).toEqual({
      verified: false,
      reason: 'RECIPIENT_NOT_INTERNAL_TEST_BUSINESS',
    });
  });

  it('rejects catalog ids outside the Smart Visions allowlist', () => {
    expect(verifyControlledWhatsAppPilot({ ...base, catalogContentId: 'SV-NOT-REAL' })).toEqual({
      verified: false,
      reason: 'CATALOG_CONTENT_NOT_ALLOWLISTED',
    });
  });
});

describe('controlled WhatsApp pilot runtime resolution', () => {
  it('uses the Cloudflare APP_BASE_URL before any legacy Vercel rollback URL', () => {
    expect(resolveControlledPilotGrowthOsBaseUrl({
      appBaseUrl: 'https://app.smartvisionsai.com',
      vercelProjectProductionUrl: 'smartvisions.vercel.app',
    })).toBe('https://app.smartvisionsai.com');
  });

  it('allows the isolated Cloudflare release candidate runtime', () => {
    expect(resolveControlledPilotGrowthOsBaseUrl({
      appBaseUrl: 'https://smartvisions-growth-os-release-candidate.hamedarezoo900.workers.dev/',
    })).toBe('https://smartvisions-growth-os-release-candidate.hamedarezoo900.workers.dev');
  });

  it('keeps the explicit Vercel URL only as a rollback fallback when APP_BASE_URL is absent', () => {
    expect(resolveControlledPilotGrowthOsBaseUrl({
      vercelProjectProductionUrl: 'smartvisions.vercel.app',
    })).toBe('https://smartvisions.vercel.app');
  });

  it('fails closed on an invalid APP_BASE_URL instead of silently falling back to Vercel', () => {
    expect(() => resolveControlledPilotGrowthOsBaseUrl({
      appBaseUrl: 'https://example.com',
      vercelProjectProductionUrl: 'smartvisions.vercel.app',
    })).toThrow('APP_BASE_URL is not an allowlisted controlled-pilot Growth OS runtime');
  });

  it('fails closed when no controlled-pilot runtime is configured', () => {
    expect(() => resolveControlledPilotGrowthOsBaseUrl({})).toThrow(
      'Controlled pilot Growth OS base URL is not configured',
    );
  });
});
