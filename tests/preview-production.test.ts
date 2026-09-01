import { describe, expect, it } from 'vitest';
import {
  buildContentProposal,
  buildWebsitePreviewInput,
  evaluateGenerationEligibility,
  isPreviewExpiredAt,
  normalizeProductionLane,
  previewBriefHash,
  shouldAllowHeavyGeneration,
} from '@/lib/preview/production';

describe('production preview planning', () => {
  it('blocks low-value cold generation and hard-blocked lead states', () => {
    expect(evaluateGenerationEligibility({ leadStatus: 'NEW', lane: 'WEBSITE', opportunityScore: 40, threshold: 60 }).eligible).toBe(false);
    expect(evaluateGenerationEligibility({ leadStatus: 'DO_NOT_CONTACT', lane: 'WEBSITE', opportunityScore: 95 }).reasons).toContain('LEAD_STATUS_BLOCKED');
  });

  it('allows explicit interest without lowering safety status rules', () => {
    expect(evaluateGenerationEligibility({ leadStatus: 'REPLIED', lane: 'WEBSITE', opportunityScore: 10, explicitRequest: true }).eligible).toBe(true);
  });

  it('maps existing growth lanes instead of inventing a second router', () => {
    expect(normalizeProductionLane('MUSCAT_LOCAL_GROWTH', ['CONTENT_CREATION'])).toBe('MUSCAT_LOCAL_CONTENT');
    expect(normalizeProductionLane('OMAN_REMOTE_GROWTH', ['AI_CONTENT'])).toBe('OMAN_REMOTE_CONTENT');
    expect(normalizeProductionLane('INTERNATIONAL_AI_GROWTH', ['WEBSITE','AI_CONTENT'])).toBe('INTERNATIONAL_AI_CONTENT');
    expect(normalizeProductionLane('MUSCAT_LOCAL_GROWTH', ['WEBSITE'])).toBe('WEBSITE');
  });

  it('hashes equivalent nested briefs identically', () => {
    const a = previewBriefHash({ business: { name: 'A', city: 'Muscat' }, services: ['web'] });
    const b = previewBriefHash({ services: ['web'], business: { city: 'Muscat', name: 'A' } });
    expect(a).toBe(b);
  });

  it('treats elapsed or invalid preview lifetimes as expired', () => {
    const now = new Date('2026-08-31T17:00:00Z');
    expect(isPreviewExpiredAt('2026-08-30T17:00:00Z', now)).toBe(true);
    expect(isPreviewExpiredAt('2026-09-01T17:00:00Z', now)).toBe(false);
    expect(isPreviewExpiredAt('not-a-date', now)).toBe(true);
    expect(isPreviewExpiredAt(null, now)).toBe(true);
  });

  it('uses the confirmed website language instead of inferring it from country', () => {
    const english = buildWebsitePreviewInput({
      businessName: 'Pearl Dental',
      category: 'Dental Clinic',
      countryCode: 'OM',
      siteLanguage: 'en',
      languageSource: 'customer',
      city: 'Muscat',
    });
    const bilingual = buildWebsitePreviewInput({
      businessName: 'Pearl Dental',
      category: 'Dental Clinic',
      countryCode: 'OM',
      siteLanguage: 'bilingual',
      languageSource: 'owner',
      city: 'Muscat',
    });
    expect(english.vertical).toBe('dental');
    expect(english.language).toBe('en');
    expect(bilingual.language).toBe('bilingual');
  });

  it('maps broader industries to a curated customer-grade vertical', () => {
    expect(buildWebsitePreviewInput({ businessName: 'A', category: 'Medical Clinic', countryCode: 'OM', siteLanguage: 'ar', languageSource: 'customer' }).vertical).toBe('clinic');
    expect(buildWebsitePreviewInput({ businessName: 'B', category: 'Auto Garage', countryCode: 'OM', siteLanguage: 'en', languageSource: 'customer' }).vertical).toBe('automotive');
    expect(buildWebsitePreviewInput({ businessName: 'C', category: 'Hotel', countryCode: 'OM', siteLanguage: 'bilingual', languageSource: 'owner' }).vertical).toBe('hospitality');
  });

  it('creates proposal-level content before any heavy media generation', () => {
    const local = buildContentProposal({ lane: 'MUSCAT_LOCAL_CONTENT', businessName: 'Clinic', city: 'Muscat' });
    expect(local.kind).toBe('LOCAL_CONTENT_PROPOSAL');
    expect(shouldAllowHeavyGeneration({ valueScore: 50 })).toBe(false);
    expect(shouldAllowHeavyGeneration({ ownerApproved: true, valueScore: 10 })).toBe(true);
  });
});
