import { describe, expect, it } from 'vitest';
import {
  resolveControlledPilotGrowthOsBaseUrl,
  verifyControlledWhatsAppCatalogPilot,
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

describe('controlled WhatsApp catalog pilot verification', () => {
  it('accepts only the owner-approved internal test shadow artifact', () => {
    expect(verifyControlledWhatsAppCatalogPilot(base)).toEqual({
      verified: true,
      catalogContentId: 'SV-WEB-001',
      recipient: '96877511053',
    });
  });

  it('rejects a request flag without canonical shadow provenance', () => {
    expect(verifyControlledWhatsAppCatalogPilot({ ...base, providerMessageId: 'wamid.external' })).toEqual({
      verified: false,
      reason: 'SHADOW_PROVIDER_ID_MISMATCH',
    });
  });

  it('rejects non-internal businesses and recipient mismatches', () => {
    expect(verifyControlledWhatsAppCatalogPilot({ ...base, businessCategory: 'DENTAL' }).verified).toBe(false);
    expect(verifyControlledWhatsAppCatalogPilot({ ...base, businessWhatsapp: '+968 9999 9999' })).toEqual({
      verified: false,
      reason: 'RECIPIENT_NOT_INTERNAL_TEST_BUSINESS',
    });
  });

  it('rejects catalog ids outside the Smart Visions allowlist', () => {
    expect(verifyControlledWhatsAppCatalogPilot({ ...base, catalogContentId: 'SV-NOT-REAL' })).toEqual({
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
