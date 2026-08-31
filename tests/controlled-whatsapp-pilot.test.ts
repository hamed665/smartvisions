import { describe, expect, it } from 'vitest';
import { verifyControlledWhatsAppCatalogPilot } from '@/lib/outreach/controlled-whatsapp-pilot';

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
