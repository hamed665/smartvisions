export type PilotDiscoveryJournalRow = {
  id: string;
  source_id: string;
  raw_payload: unknown;
  discovered_at: string;
};

export type PilotGrowthRecoveryRow = {
  sales_lane: string | null;
  service_region: string | null;
  overall_sales_score: number | null;
  prospect_tier: string | null;
  qualification_score: number | null;
  qualification_confidence: number | null;
  primary_offer_family: string | null;
  primary_service_id: string | null;
  should_contact: boolean | null;
  evidence_gaps: unknown;
  personalization_fingerprint: unknown;
  cheapest_next_action: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function findOldestUnreconciledPilotDiscovery(rows: PilotDiscoveryJournalRow[]) {
  return rows
    .filter((row) => {
      const raw = record(row.raw_payload);
      return raw.autoAcquisitionPilot === true && raw.detailsLookupCharged !== true;
    })
    .sort((a, b) => new Date(a.discovered_at).getTime() - new Date(b.discovered_at).getTime())[0] ?? null;
}

export function buildRecoveredPilotDiscovery(input: {
  journalRaw: unknown;
  recoveredAt: string;
  settledAt?: string | null;
  settledUsageEventId: string;
  businessId: string;
  leadId: string | null;
  growth: PilotGrowthRecoveryRow;
  marketCatalog: Set<string>;
}) {
  const primaryServiceId = String(input.growth.primary_service_id ?? '').trim() || null;
  const primaryOfferFamily = String(input.growth.primary_offer_family ?? '').trim() || 'UNKNOWN';
  const prospectTier = String(input.growth.prospect_tier ?? '').trim() || 'UNKNOWN';
  const cheapestNextAction = String(input.growth.cheapest_next_action ?? '').trim() || 'UNKNOWN';
  const priorityQualified = input.growth.should_contact === true
    && prospectTier === 'A'
    && Boolean(primaryServiceId)
    && input.marketCatalog.has(String(primaryServiceId));

  const qualificationReason = priorityQualified
    ? `TIER_A_${primaryOfferFamily}`
    : cheapestNextAction === 'WEBSITE_EVIDENCE' || cheapestNextAction === 'SOCIAL_CHECK'
      ? `EVIDENCE_REQUIRED_${cheapestNextAction}`
      : cheapestNextAction === 'CATALOG_SETUP'
        ? `CATALOG_REQUIRED_${primaryOfferFamily}`
        : `TIER_${prospectTier}_${primaryOfferFamily}`;

  return {
    priorityQualified,
    qualificationReason,
    rawPayload: {
      ...record(input.journalRaw),
      enrichedAt: input.settledAt || input.recoveredAt,
      recoveredAt: input.recoveredAt,
      recoverySource: 'SETTLED_COST_LEDGER',
      settledUsageEventId: input.settledUsageEventId,
      businessId: input.businessId,
      leadId: input.leadId,
      detailsLookupCharged: true,
      priorityQualified,
      qualificationReason,
      prospectTier,
      qualificationScore: input.growth.qualification_score,
      qualificationConfidence: input.growth.qualification_confidence,
      primaryOfferFamily,
      primaryServiceId,
      shouldContact: input.growth.should_contact === true,
      evidenceGaps: input.growth.evidence_gaps,
      growthLane: input.growth.sales_lane,
      serviceRegion: input.growth.service_region,
      overallSalesScore: input.growth.overall_sales_score,
      personalizationFingerprint: input.growth.personalization_fingerprint,
      cheapestNextAction,
      qualificationTier: 'ENTERPRISE_NO_REVIEWS',
      outboundDraftQueued: false,
      providerSendTriggered: false,
    },
  };
}
