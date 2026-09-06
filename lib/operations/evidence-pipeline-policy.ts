export type EvidencePipelineAuditSnapshot = {
  status?: string | null;
  auditedAt?: string | null;
  createdAt?: string | null;
};

export type EvidencePipelineCandidateInput = {
  prospectTier?: string | null;
  shouldContact?: boolean | null;
  cheapestNextAction?: string | null;
  hasStandaloneWebsite: boolean;
  hasEmail: boolean;
};

export type EvidencePipelineAuditDecision = 'USE_CACHED' | 'FETCH' | 'WAIT_AFTER_FAILURE';

export function evidencePipelineCandidatePriority(input: EvidencePipelineCandidateInput) {
  if (!input.hasStandaloneWebsite) return null;
  if (String(input.prospectTier ?? '').toUpperCase() === 'A' && input.shouldContact === true && !input.hasEmail) return 0;
  if (String(input.cheapestNextAction ?? '').toUpperCase() === 'WEBSITE_EVIDENCE') return 1;
  return null;
}

export function evidencePipelineAuditDecision(
  audit: EvidencePipelineAuditSnapshot | null | undefined,
  now = new Date(),
  cacheDays = 30,
): EvidencePipelineAuditDecision {
  if (!audit) return 'FETCH';
  const timestamp = Date.parse(String(audit.auditedAt ?? audit.createdAt ?? ''));
  if (!Number.isFinite(timestamp)) return 'FETCH';
  const ageMs = Math.max(0, now.getTime() - timestamp);
  const status = String(audit.status ?? '').toUpperCase();
  if (status === 'SUCCEEDED' && ageMs <= Math.max(1, cacheDays) * 86_400_000) return 'USE_CACHED';
  if (status === 'FAILED' && ageMs <= 24 * 60 * 60 * 1000) return 'WAIT_AFTER_FAILURE';
  return 'FETCH';
}
