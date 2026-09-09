import type { DiscoveredBusiness } from './types';
import type { PersonalizationRegion } from './personalization';
import type { buildServiceFitQualification } from './service-fit';
import { deriveWhatsappCandidate } from './selective-enrichment';

export type CompanySize = 'MICRO' | 'SMALL' | 'MEDIUM' | 'ENTERPRISE';
export type RevenuePotentialBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'STRATEGIC';
export type RecommendedAcquisitionRoute =
  | 'EMAIL'
  | 'GCC_HUMAN_IG_WA'
  | 'HYBRID_EMAIL_HUMAN_GCC'
  | 'HUMAN_REVIEW'
  | 'NONE';

const GCC_MARKETS = new Set(['OM', 'AE', 'SA', 'QA']);
const clean = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => clean(value).toUpperCase();
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const isInstagramUrl = (value: unknown) => /(?:^|\.)instagram\.com/i.test(clean(value).replace(/^https?:\/\//i, ''));

function knownInstagram(business: DiscoveredBusiness) {
  return Boolean(clean(business.instagram)) || isInstagramUrl(business.officialWebsite);
}

function contactSignals(business: DiscoveredBusiness) {
  const explicitWhatsapp = Boolean(clean(business.whatsapp));
  const hasPhone = Boolean(clean(business.internationalPhone) || clean(business.phone));
  const whatsappCandidate = Boolean(
    explicitWhatsapp
      || deriveWhatsappCandidate(business.internationalPhone, business.phone, business.countryCode),
  );
  const officialWebsite = clean(business.officialWebsite);
  return {
    hasEmail: Boolean(clean(business.email)),
    hasPhone,
    explicitWhatsapp,
    hasWhatsapp: whatsappCandidate,
    hasInstagram: knownInstagram(business),
    hasWebsite: Boolean(officialWebsite) && !isInstagramUrl(officialWebsite),
  };
}

export function buildAcquisitionContactabilityScore(business: DiscoveredBusiness) {
  const contact = contactSignals(business);
  // This is reachability, not permission. Public phone/IG/website evidence must never
  // authorize automated outreach; channel policy and opt-in gates remain separate.
  return clamp(
    (contact.hasPhone ? 35 : 0)
      + (contact.explicitWhatsapp ? 25 : contact.hasWhatsapp ? 5 : 0)
      + (contact.hasEmail ? 25 : 0)
      + (contact.hasInstagram ? 10 : 0)
      + (contact.hasWebsite ? 5 : 0),
  );
}

export function classifyCompanySize(business: DiscoveredBusiness): {
  companySize: CompanySize;
  reason: string;
} {
  const reviews = Math.max(0, Number(business.userRatingCount ?? 0));
  const identity = `${clean(business.name)} ${clean(business.category)} ${clean(business.primaryTypeDisplayName)}`.toLowerCase();
  const enterpriseCue = /\b(group|holding|holdings|hospital|university|bank|corporation|corporate|resort|hotel group|medical group)\b/i.test(identity);
  const premium = /expensive|high/i.test(clean(business.priceLevel));

  // Google Places has no employee-count field. Keep this deliberately conservative and
  // explainable: it is a routing estimate, never a factual employee-count claim.
  if (reviews >= 2000 || (enterpriseCue && reviews >= 500)) {
    return { companySize: 'ENTERPRISE', reason: `Strong scale signals (${reviews} reviews${enterpriseCue ? ', enterprise-category/name cue' : ''}).` };
  }
  if (reviews >= 300 || (enterpriseCue && reviews >= 120) || (premium && reviews >= 180)) {
    return { companySize: 'MEDIUM', reason: `Meaningful scale signals (${reviews} reviews${enterpriseCue ? ', organisation cue' : ''}).` };
  }
  if (reviews >= 40) {
    return { companySize: 'SMALL', reason: `Established local activity signal (${reviews} reviews).` };
  }
  return { companySize: 'MICRO', reason: `Limited public scale evidence (${reviews} reviews); classify conservatively.` };
}

export function classifyRevenuePotential(score: number): RevenuePotentialBand {
  const normalized = clamp(score);
  if (normalized >= 88) return 'STRATEGIC';
  if (normalized >= 75) return 'HIGH';
  if (normalized >= 60) return 'MEDIUM';
  return 'LOW';
}

export function buildUrgencyScore(input: {
  primaryOfferFamily: ReturnType<typeof buildServiceFitQualification>['primaryOfferFamily'];
  serviceFitScore: number;
  qualificationConfidence: number;
  shouldContact: boolean;
}) {
  const familyBase: Record<string, number> = {
    WEBSITE_BUILD: 88,
    SEO_GROWTH: 84,
    MUSCAT_CONTENT_GROWTH: 82,
    WEBSITE_UPGRADE: 76,
    WHATSAPP_AI: 74,
    AI_REELS: 70,
    NONE: 0,
  };
  const evidenceBase = familyBase[input.primaryOfferFamily] ?? 0;
  if (!evidenceBase) return 0;
  return clamp(
    evidenceBase * 0.55
      + clamp(input.serviceFitScore) * 0.25
      + clamp(input.qualificationConfidence) * 0.15
      + (input.shouldContact ? 5 : 0),
  );
}

export function buildPriorityScore(input: {
  fitScore: number;
  contactabilityScore: number;
  revenuePotentialScore: number;
  urgencyScore: number;
}) {
  return clamp(
    clamp(input.fitScore) * 0.35
      + clamp(input.contactabilityScore) * 0.25
      + clamp(input.revenuePotentialScore) * 0.25
      + clamp(input.urgencyScore) * 0.15,
  );
}

export function recommendAcquisitionRoute(input: {
  business: DiscoveredBusiness;
  companySize: CompanySize;
}): { route: RecommendedAcquisitionRoute; reason: string } {
  const market = upper(input.business.countryCode);
  const contact = contactSignals(input.business);
  const hasGccHumanPath = contact.hasInstagram || contact.hasWhatsapp || contact.hasPhone;

  if (GCC_MARKETS.has(market)) {
    if (input.companySize === 'ENTERPRISE' || input.companySize === 'MEDIUM') {
      if (contact.hasEmail && hasGccHumanPath) {
        return {
          route: 'HYBRID_EMAIL_HUMAN_GCC',
          reason: 'GCC medium/enterprise account with both email and human-assisted IG/WhatsApp contact paths.',
        };
      }
      if (contact.hasEmail) return { route: 'EMAIL', reason: 'GCC medium/enterprise account with an email path.' };
      if (hasGccHumanPath) {
        return {
          route: 'GCC_HUMAN_IG_WA',
          reason: 'GCC medium/enterprise account without email; use human-assisted Instagram/WhatsApp acquisition, never generic cold WhatsApp API.',
        };
      }
    } else {
      if (hasGccHumanPath) {
        return {
          route: 'GCC_HUMAN_IG_WA',
          reason: 'GCC SME: human-assisted Instagram/WhatsApp acquisition is preferred; agent automation starts only after inbound/permission.',
        };
      }
      if (contact.hasEmail) return { route: 'EMAIL', reason: 'GCC SME has no IG/phone path; email is a secondary route subject to market policy.' };
    }
  }

  if (['GB', 'US', 'CA'].includes(market)) {
    if (contact.hasEmail) return { route: 'EMAIL', reason: `${market} is email-first; actual sending remains subject to the country policy gate.` };
    return { route: 'HUMAN_REVIEW', reason: `${market} has no email path; do not invent an automated social/WhatsApp route.` };
  }

  if (contact.hasEmail) return { route: 'EMAIL', reason: 'Email is the only deterministic supported acquisition route for this market.' };
  if (hasGccHumanPath) return { route: 'HUMAN_REVIEW', reason: 'A contact path exists but no configured market strategy authorizes automated first touch.' };
  return { route: 'NONE', reason: 'No usable acquisition path is currently known.' };
}

export function buildRevenuePriority(input: {
  business: DiscoveredBusiness;
  region: PersonalizationRegion;
  qualification: ReturnType<typeof buildServiceFitQualification>;
}) {
  const size = classifyCompanySize(input.business);
  const operational = upper(input.business.businessStatus) === 'OPERATIONAL';
  const acquisitionContactabilityScore = operational ? buildAcquisitionContactabilityScore(input.business) : 0;
  const urgencyScore = operational
    ? buildUrgencyScore({
      primaryOfferFamily: input.qualification.primaryOfferFamily,
      serviceFitScore: input.qualification.serviceFitScore,
      qualificationConfidence: input.qualification.qualificationConfidence,
      shouldContact: input.qualification.shouldContact,
    })
    : 0;
  const priorityScore = operational
    ? buildPriorityScore({
      fitScore: input.qualification.serviceFitScore,
      contactabilityScore: acquisitionContactabilityScore,
      revenuePotentialScore: input.qualification.revenuePotentialScore,
      urgencyScore,
    })
    : 0;
  const route = operational
    ? recommendAcquisitionRoute({ business: input.business, companySize: size.companySize })
    : { route: 'NONE' as const, reason: 'Business is not operational; acquisition is blocked.' };
  const configuredFits = input.qualification.serviceFits
    .map((item) => item.serviceId)
    .filter((value): value is string => Boolean(value));
  const used = new Set([input.qualification.primaryServiceId, input.qualification.secondaryServiceId].filter(Boolean));
  const futureServiceId = configuredFits.find((serviceId) => !used.has(serviceId)) ?? null;
  const doNotOfferServiceIds = input.region === 'MUSCAT_LOCAL' ? [] : ['custom_content_production'];

  return {
    companySize: size.companySize,
    companySizeReason: size.reason,
    acquisitionContactabilityScore,
    revenuePotentialBand: classifyRevenuePotential(input.qualification.revenuePotentialScore),
    urgencyScore,
    priorityScore,
    recommendedAcquisitionRoute: route.route,
    acquisitionRoutingReason: route.reason,
    futureServiceId,
    doNotOfferServiceIds,
  };
}
