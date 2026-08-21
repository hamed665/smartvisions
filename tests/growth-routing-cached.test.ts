import { describe, expect, it } from 'vitest';
import { classifyWebsiteUri, deriveWhatsappCandidate } from '../lib/hunters/business/selective-enrichment';

describe('cached growth routing helpers', () => {
  it('treats directory and social URLs as non-standalone presence', () => {
    expect(classifyWebsiteUri('https://www.whatclinic.com/dentists/oman/muscat/example')).toBe('CONTACT_ONLY');
    expect(classifyWebsiteUri('https://www.instagram.com/example')).toBe('CONTACT_ONLY');
    expect(classifyWebsiteUri('https://exampleclinic.om')).toBe('STANDALONE');
  });

  it('derives an Oman WhatsApp candidate locally', () => {
    expect(deriveWhatsappCandidate('+968 9234 7436', null, 'OM')).toBe('https://wa.me/96892347436');
  });
});
