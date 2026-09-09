import type { DiscoveredBusiness } from './types';
import { classifyWebsiteUri } from './selective-enrichment';
import { buildZeroCostPersonalization } from './personalization';
import { buildDigitalPresenceEvidence } from './digital-evidence';
import {
  buildServiceFitQualification,
  type SocialAssessment,
  type WebsiteAuditEvidence,
} from './service-fit';
import { buildRevenuePriority } from './revenue-priority';

export type GrowthServiceRegion = 'MUSCAT_LOCAL' | 'OMAN_REMOTE' | 'INTERNATIONAL_REMOTE';
export type GrowthLane = 'MUSCAT_LOCAL_GROWTH' | 'OMAN_REMOTE_GROWTH' | 'INTERNATIONAL_AI_GROWTH';
export type ContentCheckStatus = 'NOT_ELIGIBLE' | 'PENDING_SOCIAL_CHECK' | 'READY_FOR_REVIEW';

const MUSCAT_HINTS = [
  'muscat','masqat','مسقط','bosher','bawshar','بوشر','azaiba','al azaiba','العذيبة','khuwair','الخوير','qurum','القرم','seeb','السيب','muttrah','matrah','مطرح','amerat','al amerat','العامرات','ghubra','الغبرة','mawaleh','الموالح','hail','الحيل','madinat al sultan qaboos','mq',
];

function text(value: string | null | undefined) { return String(value ?? '').trim().toLowerCase(); }

export function classifyServiceRegion(countryCode: string | null | undefined, city: string | null | undefined): GrowthServiceRegion {
  const country = text(countryCode).toUpperCase();
  const location = text(city);
  if (country !== 'OM') return 'INTERNATIONAL_REMOTE';
  if (MUSCAT_HINTS.some((hint) => location.includes(hint))) return 'MUSCAT_LOCAL';
  return 'OMAN_REMOTE';
}

export function buildGrowthOpportunity(
  business: DiscoveredBusiness,
  options: {
    websiteAudit?: WebsiteAuditEvidence | null;
    socialAssessment?: SocialAssessment | null;
    enabledServiceIds?: ReadonlySet<string>;
  } = {},
) {
  const operational = String(business.businessStatus ?? '').toUpperCase() === 'OPERATIONAL';
  const websiteClass = classifyWebsiteUri(business.officialWebsite);
  const region = classifyServiceRegion(business.countryCode, business.city);
  const lane: GrowthLane = region === 'MUSCAT_LOCAL'
    ? 'MUSCAT_LOCAL_GROWTH'
    : region === 'OMAN_REMOTE'
      ? 'OMAN_REMOTE_GROWTH'
      : 'INTERNATIONAL_AI_GROWTH';

  const basePersonalization = buildZeroCostPersonalization(business, region, websiteClass);
  const qualification = buildServiceFitQualification({
    business,
    region,
    websiteClass,
    websiteAudit: options.websiteAudit,
    socialAssessment: options.socialAssessment,
    enabledServiceIds: options.enabledServiceIds,
  });
  const revenuePriority = buildRevenuePriority({ business, region, qualification });

  const websiteScore = Math.max(0, ...qualification.serviceFits
    .filter((item) => ['WEBSITE_BUILD','WEBSITE_UPGRADE','SEO_GROWTH'].includes(item.family))
    .map((item) => item.score));
  const localContentScore = Math.max(0, ...qualification.serviceFits
    .filter((item) => item.family === 'MUSCAT_CONTENT_GROWTH')
    .map((item) => item.score));
  const aiContentScore = Math.max(0, ...qualification.serviceFits
    .filter((item) => item.family === 'AI_REELS')
    .map((item) => item.score));
  const overallSalesScore = qualification.qualificationScore;
  const recommendedServices = qualification.serviceFits
    .map((item) => item.serviceId)
    .filter((value): value is string => Boolean(value))
    .slice(0, 2);
  const offerBundle = qualification.serviceFits.slice(0, 2).map((item) => item.family);

  const personalization = {
    ...basePersonalization,
    contactabilityScore: revenuePriority.acquisitionContactabilityScore,
    needScore: qualification.needScore,
    serviceFitScore: qualification.serviceFitScore,
    revenuePotentialScore: qualification.revenuePotentialScore,
    personalizationPriorityScore: revenuePriority.priorityScore,
    offerBundle,
    recommendedAngle: qualification.primaryOfferFamily === 'NONE'
      ? basePersonalization.recommendedAngle
      : `${qualification.primaryOfferFamily}: ${basePersonalization.recommendedAngle}`,
    messageHooks: [...new Set([...basePersonalization.messageHooks, ...qualification.reasons])],
    socialCheckEligible: qualification.cheapestNextAction === 'SOCIAL_CHECK',
    cheapestNextAction: qualification.cheapestNextAction,
    nextActionReason: qualification.nextActionReason,
    nextActionCanSpendMoney: qualification.nextActionCanSpendMoney,
  };

  const baseEvidence = buildDigitalPresenceEvidence(business, websiteClass);
  const socialAssessment = options.socialAssessment ?? { status: 'UNKNOWN', quality: 'UNKNOWN' };
  const digitalEvidence = {
    ...baseEvidence,
    ...(options.websiteAudit ? {
      websiteEvidenceStatus: 'AUDITED',
      websiteAudit: options.websiteAudit,
    } : {}),
    socialAssessment,
    socialQuality: socialAssessment.status === 'VERIFIED' ? socialAssessment.quality : 'UNKNOWN',
    safeClaims: {
      ...baseEvidence.safeClaims,
      socialContentWeak: socialAssessment.status === 'VERIFIED' ? socialAssessment.quality === 'WEAK' : null,
      socialContentInactive: socialAssessment.status === 'VERIFIED' ? socialAssessment.quality === 'INACTIVE' : null,
    },
    qualification: {
      tier: qualification.prospectTier,
      score: qualification.qualificationScore,
      confidence: qualification.qualificationConfidence,
      primaryOfferFamily: qualification.primaryOfferFamily,
      primaryServiceId: qualification.primaryServiceId,
      primarySuggestedServiceId: qualification.primarySuggestedServiceId,
      secondaryOfferFamily: qualification.secondaryOfferFamily,
      secondaryServiceId: qualification.secondaryServiceId,
      catalogReady: qualification.catalogReady,
      shouldContact: qualification.shouldContact,
      evidenceGaps: qualification.evidenceGaps,
    },
    revenuePriority,
  };

  const contentCheckStatus: ContentCheckStatus = !operational
    ? 'NOT_ELIGIBLE'
    : qualification.cheapestNextAction === 'SOCIAL_CHECK'
      ? 'PENDING_SOCIAL_CHECK'
      : 'READY_FOR_REVIEW';

  return {
    region,
    lane,
    websiteClass,
    websiteScore,
    localContentScore,
    aiContentScore,
    overallSalesScore,
    contentCheckStatus,
    recommendedServices: [...new Set(recommendedServices)],
    reasons: qualification.reasons,
    personalization,
    digitalEvidence,
    qualification,
    revenuePriority,
  };
}

export type GrowthOpportunity = ReturnType<typeof buildGrowthOpportunity>;

export function buildGrowthOpportunityPersistenceRow(
  organizationId: string,
  businessId: string,
  opportunity: GrowthOpportunity,
) {
  const p = opportunity.personalization;
  const q = opportunity.qualification;
  const r = opportunity.revenuePriority;
  return {
    organization_id: organizationId,
    business_id: businessId,
    service_region: opportunity.region,
    sales_lane: opportunity.lane,
    website_class: opportunity.websiteClass,
    website_score: opportunity.websiteScore,
    local_content_score: opportunity.localContentScore,
    ai_content_score: opportunity.aiContentScore,
    overall_sales_score: opportunity.overallSalesScore,
    content_check_status: opportunity.contentCheckStatus,
    recommended_services: opportunity.recommendedServices,
    routing_reasons: opportunity.reasons,
    contactability_score: p.contactabilityScore,
    need_score: p.needScore,
    service_fit_score: p.serviceFitScore,
    revenue_potential_score: p.revenuePotentialScore,
    personalization_priority_score: p.personalizationPriorityScore,
    personalization_fingerprint: p.fingerprint,
    offer_bundle: p.offerBundle,
    recommended_angle: p.recommendedAngle,
    message_hooks: p.messageHooks,
    social_check_eligible: p.socialCheckEligible,
    cheapest_next_action: p.cheapestNextAction,
    next_action_reason: p.nextActionReason,
    next_action_can_spend_money: p.nextActionCanSpendMoney,
    digital_presence_evidence: opportunity.digitalEvidence,
    prospect_tier: q.prospectTier,
    qualification_score: q.qualificationScore,
    qualification_confidence: q.qualificationConfidence,
    primary_offer_family: q.primaryOfferFamily === 'NONE' ? null : q.primaryOfferFamily,
    primary_service_id: q.primaryServiceId,
    secondary_offer_family: q.secondaryOfferFamily,
    secondary_service_id: q.secondaryServiceId,
    should_contact: q.shouldContact,
    catalog_ready: q.catalogReady,
    qualification_reasons: q.reasons,
    evidence_gaps: q.evidenceGaps,
    company_size: r.companySize,
    company_size_reason: r.companySizeReason,
    revenue_potential_band: r.revenuePotentialBand,
    urgency_score: r.urgencyScore,
    priority_score: r.priorityScore,
    recommended_acquisition_route: r.recommendedAcquisitionRoute,
    acquisition_routing_reason: r.acquisitionRoutingReason,
    future_service_id: r.futureServiceId,
    do_not_offer_service_ids: r.doNotOfferServiceIds,
    routed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
