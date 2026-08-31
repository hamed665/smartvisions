import { describe, expect, it } from 'vitest';
import {
  SMART_VISIONS_CATALOG_ITEMS,
  SMART_VISIONS_WHATSAPP_CATALOG_ID,
  assertSmartVisionsCatalogContentId,
  getSmartVisionsCatalogItem,
  isSmartVisionsCatalogContentId,
} from '@/lib/whatsapp/catalog';

describe('Smart Visions WhatsApp catalog', () => {
  it('keeps the production catalog and six canonical content IDs stable', () => {
    expect(SMART_VISIONS_WHATSAPP_CATALOG_ID).toBe('1773319100642340');
    expect(Object.keys(SMART_VISIONS_CATALOG_ITEMS)).toEqual([
      'SV-WEB-001',
      'SV-IG-CONTENT-001',
      'SV-WA-001',
      'SV-SEO-001',
      'SV-AI-AGENT-001',
      'SV-SM-001',
    ]);
  });

  it('accepts only catalog items we explicitly sell', () => {
    expect(isSmartVisionsCatalogContentId('SV-AI-AGENT-001')).toBe(true);
    expect(getSmartVisionsCatalogItem('SV-AI-AGENT-001').serviceKey).toBe('ai_agents');
    expect(isSmartVisionsCatalogContentId('SV-UNKNOWN-999')).toBe(false);
    expect(() => assertSmartVisionsCatalogContentId('SV-UNKNOWN-999')).toThrow(/Unknown Smart Visions/);
  });
});
