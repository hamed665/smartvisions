import type { DiscoveredBusiness } from './types';
import type { IndustrySegment, PersonalizationRegion, WebsitePresenceClass } from './personalization';
import { inferIndustrySegment } from './personalization';
import { deriveWhatsappCandidate } from './selective-enrichment';

export type ProspectTier = 'A' | 'B' | 'C' | 'SKIP';
export type OfferFamily =
  | 'WEBSITE_BUILD'
  | 'WEBSITE_UPGRADE'
  | 'SEO_GROWTH'
  | 'MUSCAT_CONTENT_GROWTH'
  | 'AI_REELS'
  | 'WHATSAPP_AI'
  | 'NONE';
export type SocialQuality = 'UNKNOWN' | 'WEAK' | 'INACTIVE' | 'GOOD';
export type SocialAssessment = {
  status: 'UNKNOWN' | 'VERIFIED';
  quality: SocialQuality;
  source?: 'OWNER_REVIEW' | 'APPROVED_PROVIDER' | 'OTHER';
  assessedAt?: string;
  reasons?: string[];
};
export type WebsiteAuditEvidence = {
  seoQuality?: string | null;
  mobileQuality?: string | null;
  ctaQuality?: string | null;
  hasArabic?: boolean | null;
  hasEnglish?: boolean | null;
  hasBooking?: boolean | null;
  hasWhatsapp?: boolean | null;
  brokenLinks?: number | null;
};

type ServiceFit = {
  family: Exclude<OfferFamily, 'NONE'>;
  score: number;
  confidence: number;
  suggestedServiceId: string;
  serviceId: string | null;
  reasons: string[];
  evidenceGaps: string[];
};

const VISUAL_SEGMENTS = new Set<IndustrySegment>(['DENTAL','BEAUTY','RESTAURANT','SALON','VET','CLINIC']);
const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const bad = (value: unknown) => ['POOR','BAD','WEAK','FAIL','FAILED','LOW'].includes(upper(value));
const VERIFIED_SOCIAL_QUALITIES = new Set<SocialQuality>(['WEAK','INACTIVE','GOOD']);

export function buildOwnerSocialAssessment(input: { quality: unknown; note: unknown; assessedAt?: string }): SocialAssessment {
  const quality = upper(input.quality) as SocialQuality;
  const note = clean(input.note).slice(0, 300);
  if (!VERIFIED_SOCIAL_QUALITIES.has(quality)) throw new Error('Invalid social assessment quality');
  if (note.length < 8) throw new Error('Verified social assessment requires a specific evidence note');
  return {
    status: 'VERIFIED',
    quality,
    source: 'OWNER_REVIEW',
    assessedAt: input.assessedAt ?? new Date().toISOString(),
    reasons: [note],
  };
}

function directContactability(business: DiscoveredBusiness) {
  const hasPhone = Boolean(clean(business.internationalPhone) || clean(business.phone));
  const hasWhatsapp = Boolean(clean(business.whatsapp) || deriveWhatsappCandidate(business.internationalPhone, business.phone, business.countryCode));
  const hasEmail = Boolean(clean(business.email));
  const direct = hasPhone || hasWhatsapp || hasEmail;
  const score = hasPhone && hasWhatsapp ? 100 : hasWhatsapp ? 90 : hasPhone ? 85 : hasEmail ? 70 : 0;
  return { hasPhone, hasWhatsapp, hasEmail, direct, score };
}

function businessActivityScore(business: DiscoveredBusiness) {
  const reviews = Math.max(0, Number(business.userRatingCount ?? 0));
  const rating = Math.max(0, Number(business.rating ?? 0));
  if (reviews >= 100 && rating >= 4) return 95;
  if (reviews >= 50) return 88;
  if (reviews >= 20) return 80;
  if (reviews >= 5) return 70;
  if (reviews > 0) return 60;
  return 45;
}

function revenuePotential(segment: IndustrySegment, business: DiscoveredBusiness) {
  const country = upper(business.countryCode);
  const marketBoost = ['AE','SA','QA','GB','UK','US'].includes(country) ? 12 : country === 'OM' ? 8 : 4;
  const segmentBoost = segment === 'GENERIC' ? 8 : 20;
  return clamp(45 + marketBoost + segmentBoost + (businessActivityScore(business) >= 80 ? 15 : 5));
}

function knownInstagram(business: DiscoveredBusiness) {
  const explicit = clean(business.instagram);
  if (explicit) return explicit;
  const website = clean(business.officialWebsite);
  return /(?:^|\.)instagram\.com/i.test(website.replace(/^https?:\/\//i, '')) ? website : '';
}

function serviceIfEnabled(enabled: ReadonlySet<string>, id: string) {
  return enabled.has(id) ? id : null;
}

function fit(
  enabled: ReadonlySet<string>,
  family: Exclude<OfferFamily, 'NONE'>,
  score: number,
  confidence: number,
  suggestedServiceId: string,
  reasons: string[],
  evidenceGaps: string[] = [],
): ServiceFit {
  return {
    family,
    score: clamp(score),
    confidence: clamp(confidence),
    suggestedServiceId,
    serviceId: serviceIfEnabled(enabled, suggestedServiceId),
    reasons,
    evidenceGaps,
  };
}

export function buildServiceFitQualification(input: {
  business: DiscoveredBusiness;
  region: PersonalizationRegion;
  websiteClass: WebsitePresenceClass;
  websiteAudit?: WebsiteAuditEvidence | null;
  socialAssessment?: SocialAssessment | null;
  enabledServiceIds?: ReadonlySet<string>;
}) {
  const { business, region, websiteClass } = input;
  const enabled = input.enabledServiceIds ?? new Set<string>();
  const operational = upper(business.businessStatus) === 'OPERATIONAL';
  const segment = inferIndustrySegment(business);
  const contact = directContactability(business);
  const activityScore = businessActivityScore(business);
  const revenuePotentialScore = revenuePotential(segment, business);
  const instagram = knownInstagram(business);
  const audit = input.websiteAudit ?? null;
  const social = input.socialAssessment ?? { status: 'UNKNOWN' as const, quality: 'UNKNOWN' as const };
  const fits: ServiceFit[] = [];
  const globalGaps: string[] = [];

  if (!operational) {
    return {
      segment,
      prospectTier: 'SKIP' as ProspectTier,
      qualificationScore: 0,
      qualificationConfidence: 100,
      contactabilityScore: contact.score,
      needScore: 0,
      serviceFitScore: 0,
      revenuePotentialScore: 0,
      primaryOfferFamily: 'NONE' as OfferFamily,
      primaryServiceId: null,
      primarySuggestedServiceId: null,
      secondaryOfferFamily: null,
      secondaryServiceId: null,
      catalogReady: false,
      shouldContact: false,
      serviceFits: [],
      reasons: ['Business is not confirmed operational.'],
      evidenceGaps: [],
      cheapestNextAction: 'SKIP' as const,
      nextActionReason: 'Closed/non-operational businesses are not prospect candidates.',
      nextActionCanSpendMoney: false,
    };
  }

  if (websiteClass === 'NONE' || websiteClass === 'CONTACT_ONLY') {
    fits.push(fit(
      enabled,
      'WEBSITE_BUILD',
      websiteClass === 'NONE' ? 98 : 94,
      96,
      'business_website',
      [websiteClass === 'NONE'
        ? 'No standalone website is known, creating a direct website-design need.'
        : 'Only a social/contact/directory presence is known; no standalone website is present.'],
    ));
  } else if (!audit) {
    globalGaps.push('WEBSITE_AUDIT_REQUIRED');
  } else {
    const seoPoor = bad(audit.seoQuality);
    if (seoPoor) {
      fits.push(fit(
        enabled,
        'SEO_GROWTH',
        92,
        94,
        'seo_growth',
        ['A cached deterministic website audit marks SEO quality as weak/poor.'],
      ));
    }

    const mobilePoor = bad(audit.mobileQuality);
    const ctaPoor = bad(audit.ctaQuality);
    const missingArabic = audit.hasArabic === false;
    const noBooking = audit.hasBooking === false;
    const brokenLinks = Math.max(0, Number(audit.brokenLinks ?? 0));
    const upgradeSignals = [mobilePoor, ctaPoor, missingArabic, noBooking, brokenLinks > 0].filter(Boolean).length;
    if (upgradeSignals > 0) {
      const custom = upgradeSignals >= 3;
      const suggestedServiceId = custom ? 'custom_website' : 'premium_bilingual_website';
      const reasons = [
        mobilePoor ? 'Mobile quality is weak.' : '',
        ctaPoor ? 'CTA/conversion quality is weak.' : '',
        missingArabic ? 'Arabic support is missing.' : '',
        noBooking ? 'No booking flow was detected.' : '',
        brokenLinks > 0 ? `${brokenLinks} broken link(s) were detected.` : '',
      ].filter(Boolean);
      fits.push(fit(enabled, 'WEBSITE_UPGRADE', 68 + upgradeSignals * 6, 93, suggestedServiceId, reasons));
    }
  }

  const isVisual = VISUAL_SEGMENTS.has(segment);
  if (instagram && isVisual) {
    if (social.status === 'VERIFIED' && social.quality === 'INACTIVE') {
      fits.push(fit(
        enabled,
        region === 'MUSCAT_LOCAL' ? 'MUSCAT_CONTENT_GROWTH' : 'AI_REELS',
        96,
        95,
        region === 'MUSCAT_LOCAL' ? 'muscat_content_production' : 'ai_reels_4',
        ['Instagram presence is verified as inactive.', ...(social.reasons ?? [])],
      ));
    } else if (social.status === 'VERIFIED' && social.quality === 'WEAK') {
      fits.push(fit(
        enabled,
        region === 'MUSCAT_LOCAL' ? 'MUSCAT_CONTENT_GROWTH' : 'AI_REELS',
        92,
        92,
        region === 'MUSCAT_LOCAL' ? 'muscat_content_production' : 'ai_reels_4',
        ['Instagram/content quality is verified as weak.', ...(social.reasons ?? [])],
      ));
    } else if (social.status !== 'VERIFIED' || social.quality === 'UNKNOWN') {
      globalGaps.push('SOCIAL_QUALITY_CHECK_REQUIRED');
    }
  }

  if (contact.hasWhatsapp) {
    const whatsappStrong = Boolean(audit?.hasWhatsapp) && audit?.hasBooking === false;
    if (whatsappStrong) {
      fits.push(fit(
        enabled,
        'WHATSAPP_AI',
        84,
        86,
        'whatsapp_ai_setup',
        ['WhatsApp is a verified conversion/contact path and no booking flow was detected.'],
      ));
    }
  }

  fits.sort((a, b) => (b.score * b.confidence) - (a.score * a.confidence));
  const primary = fits[0] ?? null;
  const secondary = primary
    ? fits.slice(1).find((candidate) => candidate.score >= primary.score - 12 && candidate.confidence >= 80) ?? null
    : null;

  const primaryFitScore = primary?.score ?? 0;
  const primaryConfidence = primary?.confidence ?? (globalGaps.length ? 55 : 80);
  const qualificationScore = primary
    ? clamp(primaryFitScore * 0.50 + primaryConfidence * 0.20 + contact.score * 0.20 + activityScore * 0.10)
    : clamp(contact.score * 0.25 + activityScore * 0.15);
  const needScore = primaryFitScore;
  const serviceFitScore = primaryFitScore;

  let prospectTier: ProspectTier = 'SKIP';
  if (primary && contact.direct && qualificationScore >= 84 && primaryConfidence >= 80) prospectTier = 'A';
  else if (primary && contact.direct && qualificationScore >= 70 && primaryConfidence >= 75) prospectTier = 'B';
  else if ((primary || globalGaps.length) && qualificationScore >= 45) prospectTier = 'C';

  const catalogReady = Boolean(primary?.serviceId);
  const shouldContact = prospectTier === 'A' && contact.direct && catalogReady;
  const reasons = primary
    ? [
      `Primary fit: ${primary.family} (${primary.score}/100, confidence ${primary.confidence}/100).`,
      ...primary.reasons,
      contact.direct ? 'A direct contact path is available.' : 'No direct contact path is available.',
      `Business activity evidence score: ${activityScore}/100.`,
    ]
    : [
      'No service has enough verified evidence for a high-confidence pitch yet.',
      contact.direct ? 'A direct contact path exists, but evidence is insufficient.' : 'No direct contact path is available.',
    ];
  const evidenceGaps = [...new Set([...globalGaps, ...(primary?.evidenceGaps ?? [])])];

  let cheapestNextAction: 'SKIP' | 'CONTACT_READY' | 'SOCIAL_CHECK' | 'WEBSITE_EVIDENCE' | 'EVIDENCE_READY' | 'CATALOG_SETUP' = 'SKIP';
  let nextActionReason = 'Do not create/contact a prospect without a verified service fit.';
  if (!contact.direct) {
    nextActionReason = 'No direct phone, WhatsApp or email path is available; do not spend more on this prospect yet.';
  } else if (shouldContact) {
    cheapestNextAction = 'CONTACT_READY';
    nextActionReason = `Tier A: ${primary!.family} has strong verified evidence and a configured canonical service.`;
  } else if (prospectTier === 'A' && primary && !catalogReady) {
    cheapestNextAction = 'CATALOG_SETUP';
    nextActionReason = `${primary.family} is a strong fit, but canonical service ${primary.suggestedServiceId} is not enabled/configured; do not quote or outreach automatically.`;
  } else if (websiteClass === 'STANDALONE' && !audit) {
    cheapestNextAction = 'WEBSITE_EVIDENCE';
    nextActionReason = 'Run/reuse the deterministic website audit before deciding whether website or SEO work is justified.';
  } else if (instagram && isVisual && (social.status !== 'VERIFIED' || social.quality === 'UNKNOWN')) {
    cheapestNextAction = 'SOCIAL_CHECK';
    nextActionReason = 'Instagram is known and the industry is visual, but content weakness is not yet verified; review social evidence before pitching content.';
  } else if (prospectTier === 'B' && primary) {
    cheapestNextAction = 'EVIDENCE_READY';
    nextActionReason = 'Tier B evidence is usable for owner review, but it is intentionally below the automatic lead-promotion threshold.';
  }

  return {
    segment,
    prospectTier,
    qualificationScore,
    qualificationConfidence: primaryConfidence,
    contactabilityScore: contact.score,
    needScore,
    serviceFitScore,
    revenuePotentialScore,
    primaryOfferFamily: (primary?.family ?? 'NONE') as OfferFamily,
    primaryServiceId: primary?.serviceId ?? null,
    primarySuggestedServiceId: primary?.suggestedServiceId ?? null,
    secondaryOfferFamily: secondary?.family ?? null,
    secondaryServiceId: secondary?.serviceId ?? null,
    catalogReady,
    shouldContact,
    serviceFits: fits,
    reasons,
    evidenceGaps,
    cheapestNextAction,
    nextActionReason,
    nextActionCanSpendMoney: false,
  };
}

export function buildPrecisionLeadPersistenceRow(input: {
  organizationId: string;
  businessId: string;
  qualification: ReturnType<typeof buildServiceFitQualification>;
}) {
  if (!input.qualification.shouldContact || !input.qualification.primaryServiceId) {
    throw new Error('Only Tier A, catalog-ready prospects may be promoted to Leads');
  }
  return {
    organization_id: input.organizationId,
    business_id: input.businessId,
    status: 'NEW' as const,
    opportunity_score: input.qualification.qualificationScore,
    intent_score: 0,
    agent_mode: 'AUTO' as const,
    recommended_offer: input.qualification.primaryServiceId,
    score_reasons: input.qualification.reasons,
    updated_at: new Date().toISOString(),
  };
}
