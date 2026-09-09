import { selectFirstPartyContactEmail } from '@/lib/hunters/business/contact-evidence';

export type EvidencePipelineAuditSnapshot = {
  status?: string | null;
  auditedAt?: string | null;
  createdAt?: string | null;
  audited_at?: string | null;
  created_at?: string | null;
  sourceUrl?: string | null;
  source_url?: string | null;
  contactEmails?: string[] | null;
  contact_emails?: string[] | null;
};

export type EvidencePipelineCandidateInput = {
  prospectTier?: string | null;
  shouldContact?: boolean | null;
  cheapestNextAction?: string | null;
  hasStandaloneWebsite: boolean;
  hasEmail: boolean;
};

export type EvidencePipelineLeadActivityInput = {
  leadStatus?: string | null;
  leadAgentMode?: string | null;
  hasExactEmailFirstTouch?: boolean;
  hasNonBlockedConversationActivity?: boolean;
  hasOutreachActivity?: boolean;
  latestEmailConversationStage?: string | null;
  latestEmailConversationAgentMode?: string | null;
  latestEmailConversationRequiresHuman?: boolean | null;
};

export type EvidencePipelineAuditDecision = 'USE_CACHED' | 'FETCH' | 'WAIT_AFTER_FAILURE';

export function evidencePipelineTargetMatches(input: {
  targetCity?: string | null;
  targetIndustry?: string | null;
  businessCity?: string | null;
  formattedAddress?: string | null;
  category?: string | null;
  primaryType?: string | null;
}) {
  const normalize = (value?: string | null) => String(value ?? '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const targetCity = normalize(input.targetCity);
  const location = normalize(`${input.businessCity ?? ''} ${input.formattedAddress ?? ''}`);
  if (targetCity && !location.includes(targetCity)) return false;

  const targetIndustry = normalize(input.targetIndustry);
  if (!targetIndustry) return true;
  const businessType = normalize(`${input.category ?? ''} ${input.primaryType ?? ''}`);
  if (targetIndustry === 'dental') return /(?:dental|dentist|dentistry|orthodont|oral\s+(?:care|clinic))/.test(businessType);
  return businessType.includes(targetIndustry);
}

export function evidencePipelineCandidatePriority(input: EvidencePipelineCandidateInput) {
  if (!input.hasStandaloneWebsite) return null;
  if (String(input.prospectTier ?? '').toUpperCase() === 'A' && input.shouldContact === true) {
    // Contact-ready Tier A businesses with an existing email should be checked first.
    // The email is still not trusted here: the latest official-site audit must prove
    // a first-party address before any Shadow draft can be queued.
    return input.hasEmail ? 0 : 1;
  }
  if (String(input.cheapestNextAction ?? '').toUpperCase() === 'WEBSITE_EVIDENCE') return 2;
  return null;
}

export function evidencePipelineLeadBlocksCandidate(input: EvidencePipelineLeadActivityInput) {
  const leadStatus = String(input.leadStatus ?? '').toUpperCase();
  const leadAgentMode = String(input.leadAgentMode ?? '').toUpperCase();
  if (['DO_NOT_CONTACT', 'WON', 'LOST'].includes(leadStatus)) return true;
  if (['HUMAN', 'PAUSED'].includes(leadAgentMode)) return true;
  if (input.hasExactEmailFirstTouch || input.hasNonBlockedConversationActivity || input.hasOutreachActivity) return true;

  const conversationStage = String(input.latestEmailConversationStage ?? '').toUpperCase();
  const conversationAgentMode = String(input.latestEmailConversationAgentMode ?? '').toUpperCase();
  if (conversationStage && conversationStage !== 'NEW') return true;
  if (['HUMAN', 'PAUSED'].includes(conversationAgentMode)) return true;
  if (input.latestEmailConversationRequiresHuman === true) return true;
  return false;
}

export function evidencePipelineAuditDecision(
  audit: EvidencePipelineAuditSnapshot | null | undefined,
  now = new Date(),
  cacheDays = 30,
): EvidencePipelineAuditDecision {
  if (!audit) return 'FETCH';
  const timestamp = Date.parse(String(audit.auditedAt ?? audit.audited_at ?? audit.createdAt ?? audit.created_at ?? ''));
  if (!Number.isFinite(timestamp)) return 'FETCH';
  const ageMs = Math.max(0, now.getTime() - timestamp);
  const status = String(audit.status ?? '').toUpperCase();

  if (status === 'SUCCEEDED' && ageMs <= Math.max(1, cacheDays) * 86_400_000) {
    const sourceUrl = String(audit.sourceUrl ?? audit.source_url ?? '');
    const contactEmails = audit.contactEmails ?? audit.contact_emails ?? [];
    // Reuse a fresh audit only when it can advance the launch pipeline. A fresh
    // successful audit with no verified first-party email gets a 24h-style cooldown
    // so the same business cannot monopolize every scheduled tick.
    return selectFirstPartyContactEmail(sourceUrl, Array.isArray(contactEmails) ? contactEmails : [])
      ? 'USE_CACHED'
      : 'WAIT_AFTER_FAILURE';
  }
  if (status === 'FAILED' && ageMs <= 24 * 60 * 60 * 1000) return 'WAIT_AFTER_FAILURE';
  return 'FETCH';
}
