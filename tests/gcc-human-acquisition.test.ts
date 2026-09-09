import { describe, expect, it } from 'vitest';
import {
  humanAcquisitionReason,
  humanAcquisitionTier,
  isGccHumanAcquisitionCandidate,
} from '@/lib/hunters/business/human-acquisition';

const base = {
  priority_score: 92,
  prospect_tier: 'A',
  should_contact: false,
  recommended_acquisition_route: 'GCC_HUMAN_IG_WA',
  primary_service_id: 'custom_content_production',
  company_size: 'SMALL',
  revenue_potential_band: 'HIGH',
  businesses: {
    country_code: 'OM',
    instagram: 'https://instagram.com/example',
    whatsapp: null,
    phone: null,
    international_phone: null,
    email: null,
  },
};

describe('GCC human acquisition derivation', () => {
  it('keeps high-priority GCC IG-only businesses in the human queue even when auto-contact is false', () => {
    expect(isGccHumanAcquisitionCandidate(base)).toBe(true);
    expect(humanAcquisitionTier(base.priority_score)).toBe('A+');
    expect(humanAcquisitionReason(base)).toContain('human first touch');
  });

  it('accepts the hybrid GCC route when a human path exists', () => {
    expect(isGccHumanAcquisitionCandidate({
      ...base,
      recommended_acquisition_route: 'HYBRID_EMAIL_HUMAN_GCC',
      businesses: { ...base.businesses, country_code: 'AE', email: 'info@example.ae' },
    })).toBe(true);
  });

  it('does not turn international email-first prospects into GCC human acquisition', () => {
    expect(isGccHumanAcquisitionCandidate({
      ...base,
      recommended_acquisition_route: 'EMAIL',
      businesses: { ...base.businesses, country_code: 'US', email: 'info@example.com' },
    })).toBe(false);
  });

  it('rejects rows without an actual human contact path or useful priority', () => {
    expect(isGccHumanAcquisitionCandidate({
      ...base,
      businesses: { ...base.businesses, instagram: null },
    })).toBe(false);
    expect(isGccHumanAcquisitionCandidate({ ...base, priority_score: 0 })).toBe(false);
    expect(isGccHumanAcquisitionCandidate({ ...base, prospect_tier: 'SKIP' })).toBe(false);
  });

  it('uses deterministic priority bands', () => {
    expect(humanAcquisitionTier(90)).toBe('A+');
    expect(humanAcquisitionTier(80)).toBe('A');
    expect(humanAcquisitionTier(70)).toBe('B');
    expect(humanAcquisitionTier(69)).toBe('REVIEW');
  });
});
