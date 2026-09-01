import { describe, expect, it } from 'vitest';
import { generatePreview, isPreviewEligible } from '@/lib/preview/engine';
import { evaluatePreviewQuality } from '@/lib/preview/quality';
import { buildWebsitePreviewInput } from '@/lib/preview/production';
import { PREVIEW_TEMPLATES } from '@/lib/preview/templates';

describe('2026 premium website previews', () => {
  it('uses premium mobile-first design tokens for every built-in template', () => {
    for (const template of Object.values(PREVIEW_TEMPLATES)) {
      expect(template.maxWidth).toBeGreaterThanOrEqual(1120);
      expect(template.heroMinHeight).toBeGreaterThanOrEqual(600);
      expect(template.mobileCta).toMatch(/sticky|inline/);
      expect(template.generationCostUsd).toBe(0);
    }
  });

  it('requires an explicit language source instead of inferring Arabic from Oman', () => {
    const input = buildWebsitePreviewInput({
      businessName: 'Pearl Dental',
      category: 'Dental Clinic',
      countryCode: 'OM',
      city: 'Muscat',
      language: 'bilingual',
      languageSource: 'owner',
    });
    expect(input.language).toBe('bilingual');
    expect(input.languageSource).toBe('owner');
    expect(isPreviewEligible(input).eligible).toBe(true);
  });

  it('renders bilingual copy and passes the stricter customer-facing quality gate', () => {
    const preview = generatePreview({
      businessName: 'Pearl Dental',
      vertical: 'dental',
      countryCode: 'OM',
      language: 'bilingual',
      languageSource: 'owner',
      city: 'Muscat',
      services: ['Dental Cleaning', 'General Dentistry'],
      explicitRequest: true,
      intentScore: 80,
    });
    expect(preview.availableLocales).toEqual(['en', 'ar']);
    expect(preview.localized.en?.headline).toContain('Pearl Dental');
    expect(preview.localized.ar?.headline).toContain('Pearl Dental');
    const quality = evaluatePreviewQuality(preview);
    expect(quality.passed).toBe(true);
    expect(quality.score).toBeGreaterThanOrEqual(90);
  });

  it('does not present Smart Visions recommended services as customer services', () => {
    const input = buildWebsitePreviewInput({
      businessName: 'Example Clinic',
      category: 'Clinic',
      countryCode: 'OM',
      language: 'en',
      languageSource: 'internal_test',
      recommendedSmartVisionsServices: ['WEBSITE', 'AI_CONTENT'],
    });
    expect(input.services).toBeUndefined();
    expect(input.recommendedSmartVisionsServices).toEqual(['WEBSITE', 'AI_CONTENT']);
  });
});
