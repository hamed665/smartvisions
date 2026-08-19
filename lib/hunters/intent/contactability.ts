import type { IntentSource } from './types';

export type ContactabilityInput = {
  sourceType: IntentSource;
  explicitContactMethod: boolean;
  platformAllowsDirectContact: boolean;
  isInbound: boolean;
  isSuppressed: boolean;
};

export function evaluateContactability(input: ContactabilityInput) {
  if (input.isSuppressed) return { status: 'BLOCKED' as const, reason: 'Suppressed / do-not-contact' };
  if (input.isInbound) return { status: 'ALLOWED' as const, reason: 'Inbound request' };
  if (!input.platformAllowsDirectContact) return { status: 'REVIEW' as const, reason: 'Platform/channel does not permit assumed direct outreach' };
  if (!input.explicitContactMethod) return { status: 'REVIEW' as const, reason: 'No explicit contact path verified' };
  return { status: 'ALLOWED' as const, reason: 'Explicit request with permitted contact path' };
}
