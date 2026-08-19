import type { IntentOpportunity } from '@/lib/hunters/intent/types';

function hoursBetween(aIso: string, bIso: string) {
  return Math.max(0, (new Date(bIso).getTime() - new Date(aIso).getTime()) / 3_600_000);
}

export function scoreIntent(opportunity: IntentOpportunity) {
  if (opportunity.alreadyFilled) {
    return { score: 0, freshnessScore: 0, priority: 'SKIP' as const, reasons: ['Already filled'] };
  }

  let score = 40;
  const reasons = ['Explicit service/freelancer need +40'];
  const now = opportunity.detectedAt;
  const ageHours = opportunity.postedAt ? hoursBetween(opportunity.postedAt, now) : Number.POSITIVE_INFINITY;

  let freshnessScore = 20;
  let priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SKIP' = 'LOW';

  if (ageHours <= 1) { freshnessScore = 100; score += 25; priority = 'URGENT'; reasons.push('Posted within 1 hour +25'); }
  else if (ageHours <= 6) { freshnessScore = 85; score += 20; priority = 'HIGH'; reasons.push('Posted within 6 hours +20'); }
  else if (ageHours <= 24) { freshnessScore = 70; score += 15; priority = 'MEDIUM'; reasons.push('Posted within 24 hours +15'); }
  else if (ageHours <= 72) { freshnessScore = 50; score += 5; priority = 'LOW'; reasons.push('Posted within 3 days +5'); }
  else if (ageHours > 336) { freshnessScore = 0; score -= 30; priority = 'SKIP'; reasons.push('Older than 14 days -30'); }

  if (opportunity.budgetAmount != null) { score += 20; reasons.push('Budget mentioned +20'); }
  if (opportunity.businessIdentifiable) { score += 10; reasons.push('Business identifiable +10'); }
  if (opportunity.contactMethodAvailable) { score += 10; reasons.push('Contact method available +10'); }
  if (opportunity.serviceHint) { score += 5; reasons.push('Service match detected +5'); }

  const normalized = Math.max(0, Math.min(100, score));
  if (priority !== 'SKIP') {
    if (normalized >= 85) priority = 'URGENT';
    else if (normalized >= 70) priority = 'HIGH';
    else if (normalized >= 55) priority = 'MEDIUM';
    else priority = 'LOW';
  }

  return { score: normalized, freshnessScore, priority, reasons };
}
