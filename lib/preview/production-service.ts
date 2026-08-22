import { createClient } from '@supabase/supabase-js';
import { generatePreview } from './engine';
import { evaluatePreviewQuality } from './quality';
import { matchPortfolio, type PortfolioItem } from '@/lib/portfolio/matcher';
import { recordUsage } from '@/lib/reliability/cost-guard';
import {
  buildContentProposal,
  buildWebsitePreviewInput,
  evaluateGenerationEligibility,
  normalizeProductionLane,
  previewBriefHash,
  shouldAllowHeavyGeneration,
} from './production';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for production preview generation');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function generateProductionAsset(input: {
  organizationId: string;
  leadId: string;
  explicitRequest?: boolean;
  ownerApprovedHeavyGeneration?: boolean;
}) {
  const supabase = serviceClient();
  const [{ data: lead, error: leadError }, { data: previewDirector, error: agentError }] = await Promise.all([
    supabase.from('leads').select('id,business_id,status,opportunity_score,intent_score,recommended_offer').eq('organization_id', input.organizationId).eq('id', input.leadId).maybeSingle(),
    supabase.from('agent_settings').select('enabled,confidence_threshold,config').eq('organization_id', input.organizationId).eq('agent_name', 'preview_director').maybeSingle(),
  ]);
  if (leadError || !lead) throw new Error(leadError?.message ?? 'Lead not found');
  if (agentError) throw new Error(`Preview Director settings unavailable: ${agentError.message}`);
  if (previewDirector && !previewDirector.enabled) throw new Error('Preview Director is disabled');

  const [{ data: business, error: businessError }, { data: opportunity, error: opportunityError }, { data: portfolioRows, error: portfolioError }] = await Promise.all([
    supabase.from('businesses').select('id,name,country_code,city,category,phone,international_phone,whatsapp,instagram,official_website').eq('organization_id', input.organizationId).eq('id', lead.business_id).maybeSingle(),
    supabase.from('growth_opportunities').select('sales_lane,overall_sales_score,recommended_services,offer_bundle,recommended_angle,personalization_fingerprint,digital_presence_evidence').eq('organization_id', input.organizationId).eq('business_id', lead.business_id).maybeSingle(),
    supabase.from('portfolio_items').select('id,title,service_id,industry,country_code,approved,tags,public_url,summary').eq('organization_id', input.organizationId).eq('approved', true),
  ]);
  if (businessError || !business) throw new Error(businessError?.message ?? 'Business not found');
  if (opportunityError) throw new Error(`Growth opportunity lookup failed: ${opportunityError.message}`);
  if (!opportunity) throw new Error('Growth opportunity is required before production generation');
  if (portfolioError) throw new Error(`Portfolio lookup failed: ${portfolioError.message}`);

  const services = stringArray(opportunity.recommended_services);
  const lane = normalizeProductionLane(opportunity.sales_lane, services);
  const config = (previewDirector?.config ?? {}) as Record<string, unknown>;
  const thresholdFromConfidence = Math.round(Number(previewDirector?.confidence_threshold ?? 0.6) * 100);
  const threshold = Number(config.generation_score_threshold ?? thresholdFromConfidence || 60);
  const eligibility = evaluateGenerationEligibility({
    leadStatus: lead.status,
    opportunityScore: lead.opportunity_score,
    intentScore: lead.intent_score,
    overallSalesScore: opportunity.overall_sales_score,
    lane,
    explicitRequest: input.explicitRequest,
    threshold,
  });
  if (!eligibility.eligible || !lane) return { eligible: false as const, eligibility };

  const portfolioItems: PortfolioItem[] = (portfolioRows ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    serviceId: row.service_id ?? undefined,
    industry: row.industry ?? undefined,
    countryCode: row.country_code ?? undefined,
    approved: Boolean(row.approved),
    tags: stringArray(row.tags),
  }));
  const portfolioMatches = matchPortfolio({
    items: portfolioItems,
    serviceId: services[0],
    industry: business.category ?? undefined,
    countryCode: business.country_code ?? undefined,
    limit: 3,
  }).map(({ item, score, reasons }) => ({ ...item, score, reasons }));

  const brief = {
    leadId: input.leadId,
    lane,
    business: { id: business.id, name: business.name, countryCode: business.country_code, city: business.city, category: business.category },
    services,
    offerBundle: stringArray(opportunity.offer_bundle),
    recommendedAngle: opportunity.recommended_angle,
    fingerprint: stringArray(opportunity.personalization_fingerprint),
    portfolioIds: portfolioMatches.map((item) => item.id),
  };
  const briefHash = previewBriefHash(brief);

  const { data: existingRows, error: existingError } = await supabase
    .from('previews')
    .select('id,public_token,status,payload,created_at,expires_at')
    .eq('organization_id', input.organizationId)
    .eq('lead_id', input.leadId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (existingError) throw new Error(`Preview history lookup failed: ${existingError.message}`);

  const duplicate = (existingRows ?? []).find((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
    return metadata.brief_hash === briefHash && row.status !== 'EXPIRED' && row.status !== 'ARCHIVED';
  });
  if (duplicate) {
    return { eligible: true as const, reused: true as const, previewId: duplicate.id, publicToken: duplicate.public_token, status: duplicate.status, eligibility };
  }

  const priorVersions = (existingRows ?? []).map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
    return Number(metadata.version ?? 0);
  });
  const version = Math.max(0, ...priorVersions) + 1;

  let payload: Record<string, unknown>;
  let qualityScore = 100;
  let qualityChecks: Record<string, boolean> = { deterministic_proposal: true, no_fabricated_defects: true };
  let qualityBlockers: string[] = [];
  let templateId: string;
  let vertical: string;

  if (lane === 'WEBSITE') {
    const previewInput = buildWebsitePreviewInput({
      businessName: business.name,
      category: business.category,
      countryCode: business.country_code,
      city: business.city,
      phone: business.international_phone || business.phone,
      whatsapp: business.whatsapp,
      instagram: business.instagram,
      services,
      explicitRequest: input.explicitRequest,
      intentScore: lead.intent_score,
    });
    const document = generatePreview(previewInput);
    const quality = evaluatePreviewQuality(document);
    qualityScore = quality.score;
    qualityChecks = quality.checks;
    qualityBlockers = quality.blockers;
    templateId = document.templateId;
    vertical = document.vertical;
    payload = { preview: document };
  } else {
    const proposal = buildContentProposal({ lane, businessName: business.name, category: business.category, city: business.city, recommendedAngle: opportunity.recommended_angle, services });
    templateId = lane === 'MUSCAT_LOCAL_CONTENT' ? 'local-content-proposal-v1' : 'remote-ai-content-proposal-v1';
    vertical = business.category || 'content';
    payload = { proposal };
  }

  const heavyGenerationAllowed = shouldAllowHeavyGeneration({
    ownerApproved: input.ownerApprovedHeavyGeneration,
    explicitCustomerInterest: Boolean(input.explicitRequest),
    valueScore: eligibility.score,
    threshold: Number(config.heavy_generation_score_threshold ?? 80),
  });

  payload = {
    ...payload,
    metadata: {
      brief_hash: briefHash,
      version,
      lane,
      generation_cost_usd: 0,
      generation_mode: 'DETERMINISTIC_PROPOSAL',
      heavy_generation_allowed: heavyGenerationAllowed,
      portfolio_matches: portfolioMatches,
      growth_source: brief,
    },
  };

  const status = qualityBlockers.length ? 'QUALITY_FAILED' : 'GENERATED';
  const { data: created, error: createError } = await supabase.from('previews').insert({
    organization_id: input.organizationId,
    lead_id: input.leadId,
    template_id: templateId,
    vertical,
    status,
    payload,
    quality_score: qualityScore,
    quality_checks: qualityChecks,
    quality_blockers: qualityBlockers,
  }).select('id,public_token,status,expires_at').single();
  if (createError) throw new Error(`Production preview persistence failed: ${createError.message}`);

  const { error: eventError } = await supabase.from('preview_events').insert({
    organization_id: input.organizationId,
    preview_id: created.id,
    event_type: status === 'QUALITY_FAILED' ? 'QUALITY_FAILED' : 'GENERATED',
    metadata: { lane, version, brief_hash: briefHash, generation_cost_usd: 0 },
  });
  if (eventError) throw new Error(`Preview generation event persistence failed: ${eventError.message}`);

  await recordUsage({
    organizationId: input.organizationId,
    provider: 'INTERNAL',
    operation: lane === 'WEBSITE' ? 'WEBSITE_PREVIEW_PROPOSAL' : 'CONTENT_PROPOSAL_GENERATION',
    costUsd: 0,
    units: 1,
    leadId: input.leadId,
    metadata: { preview_id: created.id, lane, version, brief_hash: briefHash, generation_mode: 'DETERMINISTIC_PROPOSAL' },
  });

  return {
    eligible: true as const,
    reused: false as const,
    previewId: created.id,
    publicToken: created.public_token,
    status: created.status,
    expiresAt: created.expires_at,
    lane,
    version,
    heavyGenerationAllowed,
    quality: { score: qualityScore, checks: qualityChecks, blockers: qualityBlockers },
    portfolioMatches,
    eligibility,
  };
}
