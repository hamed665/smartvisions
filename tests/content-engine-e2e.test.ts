import { describe, expect, it } from 'vitest';
import { generatePreview } from '@/lib/preview/engine';
import { evaluatePreviewQuality } from '@/lib/preview/quality';
import { matchPortfolio } from '@/lib/portfolio/matcher';
import {
  buildContentProposal,
  buildWebsitePreviewInput,
  evaluateGenerationEligibility,
  normalizeProductionLane,
  previewBriefHash,
} from '@/lib/preview/production';
import { nextPreviewStatus, previewPublicPath } from '@/lib/preview/lifecycle';

describe('content engine controlled E2E fixtures', () => {
  it('takes a website opportunity through proposal, quality, version identity and share lifecycle', () => {
    const lane = normalizeProductionLane('MUSCAT_LOCAL_GROWTH', ['WEBSITE']);
    expect(lane).toBe('WEBSITE');
    const eligibility = evaluateGenerationEligibility({ leadStatus: 'QUALIFIED', opportunityScore: 82, lane });
    expect(eligibility.eligible).toBe(true);

    const input = buildWebsitePreviewInput({
      businessName: 'Pearl Dental',
      category: 'Dental Clinic',
      countryCode: 'OM',
      city: 'Muscat',
      whatsapp: '+96890000000',
      services: ['Dental Cleaning', 'General Dentistry'],
      intentScore: 72,
    });
    const preview = generatePreview(input);
    const quality = evaluatePreviewQuality(preview);
    expect(quality.passed).toBe(true);

    const briefHash = previewBriefHash({ lane, business: { name: 'Pearl Dental', city: 'Muscat' }, services: input.services });
    expect(briefHash).toHaveLength(64);
    expect(nextPreviewStatus('GENERATED', 'APPROVE')).toBe('APPROVED');
    expect(nextPreviewStatus('APPROVED', 'SEND')).toBe('SENT');
    expect(nextPreviewStatus('SENT', 'VIEW')).toBe('VIEWED');
    expect(previewPublicPath('fixture-token')).toBe('/p/fixture-token');
  });

  it('takes a content opportunity through proposal-first generation and relevant portfolio matching', () => {
    const lane = normalizeProductionLane('MUSCAT_LOCAL_GROWTH', ['CONTENT_CREATION']);
    expect(lane).toBe('MUSCAT_LOCAL_CONTENT');
    expect(evaluateGenerationEligibility({ leadStatus: 'QUALIFIED', overallSalesScore: 88, lane }).eligible).toBe(true);

    const proposal = buildContentProposal({
      lane: 'MUSCAT_LOCAL_CONTENT',
      businessName: 'Muscat Pet Clinic',
      category: 'Pet Clinic',
      city: 'Muscat',
      services: ['CONTENT_CREATION'],
    });
    expect(proposal.kind).toBe('LOCAL_CONTENT_PROPOSAL');
    expect((proposal.shotList ?? []).length).toBeGreaterThan(3);
    expect((proposal.reelConcepts ?? []).length).toBeGreaterThan(1);

    const matches = matchPortfolio({
      items: [
        { id: 'pet-om', title: 'Pet Clinic Oman', serviceId: 'CONTENT_CREATION', industry: 'Pet Clinic', countryCode: 'OM', approved: true },
        { id: 'dental-uk', title: 'Dental UK', serviceId: 'WEBSITE', industry: 'Dental Clinic', countryCode: 'UK', approved: true },
      ],
      serviceId: 'CONTENT_CREATION',
      industry: 'Pet Clinic',
      countryCode: 'OM',
    });
    expect(matches[0]?.item.id).toBe('pet-om');
    expect(matches[0]?.reasons).toEqual(expect.arrayContaining(['SERVICE_MATCH', 'INDUSTRY_MATCH', 'MARKET_MATCH']));
  });
});
