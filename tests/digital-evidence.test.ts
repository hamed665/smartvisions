import { describe, expect, it } from 'vitest';
import { buildDigitalPresenceEvidence } from '../lib/hunters/business/digital-evidence';

describe('digital presence evidence', () => {
  it('does not invent social weakness when evidence is missing', () => {
    const evidence = buildDigitalPresenceEvidence({ officialWebsite: undefined, instagram: undefined, whatsapp: undefined }, 'NONE');
    expect(evidence.websiteEvidenceStatus).toBe('NOT_NEEDED');
    expect(evidence.socialEvidenceStatus).toBe('UNKNOWN');
    expect(evidence.socialQuality).toBe('UNKNOWN');
    expect(evidence.safeClaims.socialContentWeak).toBeNull();
    expect(evidence.providerCalls).toBe(0);
  });

  it('keeps an Instagram-only presence as known-link evidence, not a website', () => {
    const evidence = buildDigitalPresenceEvidence({ officialWebsite: 'https://instagram.com/example', instagram: undefined, whatsapp: undefined }, 'CONTACT_ONLY');
    expect(evidence.websiteEvidenceStatus).toBe('KNOWN_LINK_ONLY');
    expect(evidence.socialEvidenceStatus).toBe('KNOWN_LINK_ONLY');
    expect(evidence.knownInstagram).toContain('instagram.com');
    expect(evidence.safeClaims.hasStandaloneWebsite).toBe(false);
  });

  it('queues standalone websites for evidence instead of claiming defects', () => {
    const evidence = buildDigitalPresenceEvidence({ officialWebsite: 'https://example.com', instagram: undefined, whatsapp: undefined }, 'STANDALONE');
    expect(evidence.websiteEvidenceStatus).toBe('PENDING');
    expect(evidence.socialQuality).toBe('UNKNOWN');
    expect(evidence.safeClaims.socialContentInactive).toBeNull();
  });
});
