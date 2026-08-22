import { createHash } from 'node:crypto';
import type { PreviewInput } from './types';

export type ProductionLane = 'WEBSITE' | 'MUSCAT_LOCAL_CONTENT' | 'OMAN_REMOTE_CONTENT' | 'INTERNATIONAL_AI_CONTENT';

export type GenerationEligibilityInput = {
  leadStatus?: string | null;
  opportunityScore?: number | null;
  intentScore?: number | null;
  overallSalesScore?: number | null;
  lane?: string | null;
  explicitRequest?: boolean;
  threshold?: number;
};

const blockedLeadStatuses = new Set(['DO_NOT_CONTACT','LOST']);

export function evaluateGenerationEligibility(input: GenerationEligibilityInput) {
  const threshold = Math.max(0, Math.min(100, input.threshold ?? 60));
  const score = Math.max(
    Number(input.opportunityScore ?? 0),
    Number(input.intentScore ?? 0),
    Number(input.overallSalesScore ?? 0),
  );
  const reasons: string[] = [];
  if (input.leadStatus && blockedLeadStatuses.has(input.leadStatus)) reasons.push('LEAD_STATUS_BLOCKED');
  if (!input.lane || input.lane === 'SKIP') reasons.push('NO_PRODUCTION_LANE');
  if (!input.explicitRequest && score < threshold) reasons.push('GENERATION_THRESHOLD_NOT_MET');
  return { eligible: reasons.length === 0, reasons, score, threshold };
}

export function normalizeProductionLane(salesLane?: string | null, recommendedServices: string[] = []): ProductionLane | null {
  const lane = String(salesLane ?? '').toUpperCase();
  const services = recommendedServices.map((value) => value.toUpperCase());
  if (lane === 'MUSCAT_LOCAL_GROWTH' && services.some((value) => value.includes('CONTENT'))) return 'MUSCAT_LOCAL_CONTENT';
  if (lane === 'OMAN_REMOTE_GROWTH' && services.some((value) => value.includes('CONTENT'))) return 'OMAN_REMOTE_CONTENT';
  if (lane === 'INTERNATIONAL_AI_GROWTH') return 'INTERNATIONAL_AI_CONTENT';
  if (services.some((value) => value.includes('WEBSITE')) || lane === 'WEBSITE') return 'WEBSITE';
  if (lane === 'MUSCAT_LOCAL_GROWTH') return 'MUSCAT_LOCAL_CONTENT';
  if (lane === 'OMAN_REMOTE_GROWTH') return 'OMAN_REMOTE_CONTENT';
  return null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function previewBriefHash(input: Record<string, unknown>) {
  const stable = JSON.stringify(canonicalize(input));
  return createHash('sha256').update(stable).digest('hex');
}

export function buildWebsitePreviewInput(input: {
  businessName: string;
  category?: string | null;
  countryCode: string;
  city?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  services?: string[];
  explicitRequest?: boolean;
  intentScore?: number | null;
}): PreviewInput {
  const category = String(input.category ?? '').toLowerCase();
  const vertical: PreviewInput['vertical'] = category.includes('dental') ? 'dental'
    : category.includes('beauty') ? 'beauty'
    : category.includes('salon') ? 'salon'
    : category.includes('restaurant') ? 'restaurant'
    : category.includes('cafe') || category.includes('coffee') ? 'cafe'
    : category.includes('pet') || category.includes('veter') ? 'pet_clinic'
    : category.includes('real estate') ? 'real_estate'
    : 'general';
  return {
    businessName: input.businessName,
    vertical,
    countryCode: input.countryCode,
    language: ['OM','AE','SA','QA'].includes(input.countryCode.toUpperCase()) ? 'ar' : 'en',
    city: input.city ?? undefined,
    phone: input.phone ?? undefined,
    whatsapp: input.whatsapp ?? undefined,
    instagram: input.instagram ?? undefined,
    services: input.services,
    explicitRequest: input.explicitRequest,
    intentScore: input.intentScore ?? undefined,
  };
}

export function buildContentProposal(input: {
  lane: Exclude<ProductionLane,'WEBSITE'>;
  businessName: string;
  category?: string | null;
  city?: string | null;
  recommendedAngle?: string | null;
  services?: string[];
}) {
  const angle = input.recommendedAngle || `Make ${input.businessName} easier to notice, understand and contact.`;
  if (input.lane === 'MUSCAT_LOCAL_CONTENT') {
    return {
      kind: 'LOCAL_CONTENT_PROPOSAL',
      angle,
      filmingBrief: `On-location content session for ${input.businessName}${input.city ? ` in ${input.city}` : ''}.`,
      shotList: ['Exterior/location opener','Team or service in action','Three detail shots','Customer journey moment','Clear booking/contact close'],
      reelConcepts: ['Problem → service → result','A fast behind-the-scenes service story','Three reasons to choose this business'],
      photographyPlan: ['Hero landscape','Team/service portraits','Detail/product frames','Location/contact frame'],
      packageServices: input.services ?? [],
    };
  }
  return {
    kind: 'REMOTE_AI_CONTENT_PROPOSAL',
    angle,
    reelConcepts: ['Hook-led service explainer','Before/after concept without fabricated defects','FAQ or myth-busting reel'],
    visualConcepts: ['Premium service spotlight','Customer journey storyboard','Market-localized offer creative'],
    spokespersonOptions: ['Owner/team voiceover','Neutral AI spokesperson after approval','Text-led motion creative'],
    captionDirections: ['Direct response','Trust/education','Offer-led'],
    packageServices: input.services ?? [],
  };
}

export function shouldAllowHeavyGeneration(input: { ownerApproved?: boolean; explicitCustomerInterest?: boolean; valueScore?: number | null; threshold?: number }) {
  const threshold = input.threshold ?? 80;
  return Boolean(input.ownerApproved || input.explicitCustomerInterest || Number(input.valueScore ?? 0) >= threshold);
}
