import type { DiscoveredBusiness } from './types';

export type WebsiteEvidenceStatus = 'NOT_NEEDED' | 'PENDING' | 'KNOWN_LINK_ONLY';
export type SocialEvidenceStatus = 'UNKNOWN' | 'KNOWN_LINK_ONLY';
export type SocialQualityStatus = 'UNKNOWN';

function clean(value: string | null | undefined) { return String(value ?? '').trim(); }
function isSocialOrContactUrl(value: string | null | undefined) {
  const raw = clean(value);
  if (!raw) return false;
  try {
    const host = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`).hostname.toLowerCase();
    return ['instagram.com','www.instagram.com','facebook.com','www.facebook.com','wa.me','api.whatsapp.com','whatsapp.com','www.whatsapp.com','linktr.ee','www.linktr.ee','bio.site','taplink.cc','beacons.ai','www.beacons.ai'].includes(host);
  } catch {
    return false;
  }
}

export function buildDigitalPresenceEvidence(
  business: Pick<DiscoveredBusiness, 'officialWebsite' | 'instagram' | 'whatsapp'>,
  websiteClass: 'NONE' | 'CONTACT_ONLY' | 'STANDALONE',
) {
  const knownInstagram = clean(business.instagram) || (isSocialOrContactUrl(business.officialWebsite) && /instagram\.com/i.test(clean(business.officialWebsite)) ? clean(business.officialWebsite) : '');
  const knownWhatsapp = clean(business.whatsapp) || (isSocialOrContactUrl(business.officialWebsite) && /(?:wa\.me|whatsapp\.com)/i.test(clean(business.officialWebsite)) ? clean(business.officialWebsite) : '');
  const websiteEvidenceStatus: WebsiteEvidenceStatus = websiteClass === 'STANDALONE' ? 'PENDING' : websiteClass === 'CONTACT_ONLY' ? 'KNOWN_LINK_ONLY' : 'NOT_NEEDED';
  const socialEvidenceStatus: SocialEvidenceStatus = knownInstagram || knownWhatsapp || websiteClass === 'CONTACT_ONLY' ? 'KNOWN_LINK_ONLY' : 'UNKNOWN';
  return {
    websiteEvidenceStatus,
    socialEvidenceStatus,
    socialQuality: 'UNKNOWN' as SocialQualityStatus,
    knownInstagram: knownInstagram || null,
    knownWhatsapp: knownWhatsapp || null,
    safeClaims: {
      hasStandaloneWebsite: websiteClass === 'STANDALONE',
      hasKnownSocialOrContactPresence: socialEvidenceStatus === 'KNOWN_LINK_ONLY',
      socialContentWeak: null,
      socialContentInactive: null,
    },
    providerCalls: 0,
    llmCalls: 0,
    estimatedApiCostUsd: 0,
  };
}
