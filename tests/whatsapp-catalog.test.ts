import { describe, expect, it } from 'vitest';
import {
  SMART_VISIONS_CATALOG_ITEMS,
  SMART_VISIONS_WHATSAPP_CATALOG_ID,
  assertSmartVisionsCatalogContentId,
  getSmartVisionsCatalogItem,
  isSmartVisionsCatalogContentId,
} from '@/lib/whatsapp/catalog';

describe('Smart Visions WhatsApp catalog', () => {
  it('keeps the production catalog and seven approved content IDs stable', () => {
    expect(SMART_VISIONS_WHATSAPP_CATALOG_ID).toBe('1773319100642340');
    expect(Object.keys(SMART_VISIONS_CATALOG_ITEMS)).toEqual([
      'SV-IG-CONTENT-001',
      'SV-SM-001',
      'SV-WEB-001',
      'SV-SEO-001',
      'SV-WA-001',
      'SV-BIZ-AUTO-001',
      'SV-AI-AGENT-001',
    ]);
  });

  it('keeps bilingual Meta labels without duplicating Growth OS pricing', () => {
    expect(getSmartVisionsCatalogItem('SV-IG-CONTENT-001').label).toContain('صناعة المحتوى والريلز');
    expect(getSmartVisionsCatalogItem('SV-BIZ-AUTO-001').label).toContain('Business Automation');
    expect(getSmartVisionsCatalogItem('SV-AI-AGENT-001').label).toContain('موظف ذكي');
    expect('price' in getSmartVisionsCatalogItem('SV-WEB-001')).toBe(false);
  });

  it('accepts only catalog items we explicitly sell', () => {
    expect(isSmartVisionsCatalogContentId('SV-AI-AGENT-001')).toBe(true);
    expect(getSmartVisionsCatalogItem('SV-AI-AGENT-001').serviceKey).toBe('ai_agents');
    expect(isSmartVisionsCatalogContentId('SV-UNKNOWN-999')).toBe(false);
    expect(() => assertSmartVisionsCatalogContentId('SV-UNKNOWN-999')).toThrow(/Unknown Smart Visions/);
  });
});
