import { describe, expect, it } from 'vitest';
import { buildGccHumanOpener } from '@/lib/outreach/gcc-human-script';

describe('GCC human acquisition opener', () => {
  it.each(['OM', 'AE', 'SA', 'QA'])('builds a deterministic bilingual human-only opener for %s', (marketCode) => {
    const opener = buildGccHumanOpener({ marketCode, businessName: 'Example Clinic', primaryServiceId: 'seo_growth' });
    expect(opener).toMatchObject({
      marketCode,
      mode: 'HUMAN_SEND_ONLY',
      requiresHumanSend: true,
      automatedSendAllowed: false,
    });
    expect(opener?.arabic).toContain('Example Clinic');
    expect(opener?.english).toContain('Example Clinic');
    expect(opener?.english).toContain('Google visibility');
  });

  it('does not create a GCC cold-social script for non-GCC markets', () => {
    expect(buildGccHumanOpener({ marketCode: 'US', businessName: 'Example Clinic', primaryServiceId: 'seo_growth' })).toBeNull();
    expect(buildGccHumanOpener({ marketCode: 'GB', businessName: 'Example Clinic' })).toBeNull();
  });

  it('uses only configured service-id hints and never invents a price or discount', () => {
    const opener = buildGccHumanOpener({ marketCode: 'OM', businessName: 'Example Salon', primaryServiceId: 'custom_content_production' });
    expect(opener?.arabic).not.toMatch(/\d+\s*(?:OMR|ريال|%)/i);
    expect(opener?.english).not.toMatch(/\d+\s*(?:OMR|AED|SAR|QAR|%)/i);
  });
});
