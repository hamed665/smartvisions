export type HumanAcquisitionOpportunity = {
  priority_score?: number | null;
  prospect_tier?: string | null;
  should_contact?: boolean | null;
  recommended_acquisition_route?: string | null;
  primary_service_id?: string | null;
  company_size?: string | null;
  revenue_potential_band?: string | null;
  businesses?: {
    country_code?: string | null;
    instagram?: string | null;
    whatsapp?: string | null;
    phone?: string | null;
    international_phone?: string | null;
    email?: string | null;
  } | Array<{
    country_code?: string | null;
    instagram?: string | null;
    whatsapp?: string | null;
    phone?: string | null;
    international_phone?: string | null;
    email?: string | null;
  }> | null;
};

const GCC = new Set(['OM', 'AE', 'SA', 'QA']);
const HUMAN_ROUTES = new Set(['GCC_HUMAN_IG_WA', 'HYBRID_EMAIL_HUMAN_GCC']);
const clean = (value: unknown) => String(value ?? '').trim();

export function humanAcquisitionBusiness(row: HumanAcquisitionOpportunity) {
  return Array.isArray(row.businesses) ? row.businesses[0] ?? null : row.businesses ?? null;
}

export function isGccHumanAcquisitionCandidate(row: HumanAcquisitionOpportunity) {
  const business = humanAcquisitionBusiness(row);
  const market = clean(business?.country_code).toUpperCase();
  const route = clean(row.recommended_acquisition_route).toUpperCase();
  const hasHumanPath = Boolean(
    clean(business?.instagram)
    || clean(business?.whatsapp)
    || clean(business?.international_phone)
    || clean(business?.phone),
  );
  return GCC.has(market)
    && HUMAN_ROUTES.has(route)
    && hasHumanPath
    && clean(row.prospect_tier).toUpperCase() !== 'SKIP'
    && Number(row.priority_score ?? 0) > 0;
}

export function humanAcquisitionTier(priorityScore?: number | null) {
  const score = Number(priorityScore ?? 0);
  if (score >= 90) return 'A+' as const;
  if (score >= 80) return 'A' as const;
  if (score >= 70) return 'B' as const;
  return 'REVIEW' as const;
}

export function humanAcquisitionReason(row: HumanAcquisitionOpportunity) {
  const business = humanAcquisitionBusiness(row);
  if (!business) return 'No business linkage';
  const paths = [
    clean(business.instagram) ? 'Instagram' : '',
    clean(business.whatsapp) || clean(business.international_phone) || clean(business.phone) ? 'WhatsApp/phone' : '',
    clean(business.email) ? 'email' : '',
  ].filter(Boolean);
  return `${humanAcquisitionTier(row.priority_score)} priority; human first touch via ${paths.join(' + ') || 'review'}. Agent automation begins only after inbound/permission.`;
}
