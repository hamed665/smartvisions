import { describe, expect, it } from 'vitest';
import { classifyWebsiteUri, deriveWhatsappCandidate, isPriorityNoWebsiteBusiness } from '@/lib/hunters/business/selective-enrichment';

const base = { sourceType: 'google_places' as const, name: 'Example Clinic', countryCode: 'OM', retrievedAt: new Date().toISOString(), businessStatus: 'OPERATIONAL' };

describe('contact-first lead qualification', () => {
  it('treats WhatsApp/social links as no standalone website', () => {
    expect(classifyWebsiteUri('https://wa.me/96891234567')).toBe('CONTACT_ONLY');
    expect(classifyWebsiteUri('https://instagram.com/example')).toBe('CONTACT_ONLY');
    expect(classifyWebsiteUri('https://exampleclinic.om')).toBe('STANDALONE');
    expect(isPriorityNoWebsiteBusiness({ ...base, officialWebsite: 'https://wa.me/96891234567' })).toBe(true);
    expect(isPriorityNoWebsiteBusiness({ ...base, officialWebsite: 'https://exampleclinic.om' })).toBe(false);
  });

  it('derives an Oman wa.me candidate locally from phone data', () => {
    expect(deriveWhatsappCandidate('+968 9123 4567', undefined, 'OM')).toBe('https://wa.me/96891234567');
    expect(deriveWhatsappCandidate(undefined, '9123 4567', 'OM')).toBe('https://wa.me/96891234567');
  });
});
