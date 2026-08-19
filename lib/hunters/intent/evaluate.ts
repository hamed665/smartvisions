import { classifyIntentText } from './classify';
import type { IntentOpportunity } from './types';
import { scoreIntent } from '@/lib/scoring/intent';

export function evaluateIntentOpportunity(opportunity: IntentOpportunity) {
  const classification = classifyIntentText(`${opportunity.title ?? ''}\n${opportunity.body}`);
  const enriched: IntentOpportunity = {
    ...opportunity,
    serviceHint: opportunity.serviceHint ?? classification.primaryService,
  };
  const scoring = classification.isRelevant
    ? scoreIntent(enriched)
    : { score: 0, freshnessScore: 0, priority: 'SKIP' as const, reasons: ['No explicit, relevant service need detected'] };

  return { classification, opportunity: enriched, scoring };
}
