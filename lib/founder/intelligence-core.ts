import type { FounderStatusSnapshotV1 } from './contracts';

export type FounderQuestionKind =
  | 'STATUS'
  | 'NEXT'
  | 'DECISION'
  | 'PRICING'
  | 'MARKET'
  | 'INVESTOR'
  | 'RISK'
  | 'GENERAL';

export type FounderIntelligenceResult = {
  mode: 'READ_ONLY_ANALYSIS';
  questionKind: FounderQuestionKind;
  answer: string;
  facts: string[];
  gaps: string[];
  nextAction: string;
  kpi: string;
  risks: string[];
  evidenceAuthorities: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  generatedAt: string;
};

export type FounderConversationTurn = {
  role: 'user' | 'assistant';
  text: string;
};

export type RawFounderIntelligence = {
  question_kind?: unknown;
  answer?: unknown;
  facts?: unknown;
  gaps?: unknown;
  next_action?: unknown;
  kpi?: unknown;
  risks?: unknown;
  evidence_authorities?: unknown;
  confidence?: unknown;
};

const KINDS = new Set<FounderQuestionKind>([
  'STATUS',
  'NEXT',
  'DECISION',
  'PRICING',
  'MARKET',
  'INVESTOR',
  'RISK',
  'GENERAL',
]);

function text(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max);
}

function list(value: unknown, maxItems: number, maxChars: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => text(item, maxChars))
      .filter(Boolean),
  )].slice(0, maxItems);
}

export function normalizeFounderHistory(value: unknown): FounderConversationTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: FounderConversationTurn[] = [];
  for (const item of value.slice(-6)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : null;
    const content = text(row.text, 1_200);
    if (role && content) turns.push({ role, text: content });
  }
  return turns;
}

export function founderStatusModelPayload(status: FounderStatusSnapshotV1) {
  return {
    schemaVersion: status.schemaVersion,
    mode: status.mode,
    generatedAt: status.generatedAt,
    operatingMode: status.operatingMode,
    product: status.product,
    sales: status.sales,
    finance: status.finance,
    attention: status.attention,
    evidence: status.evidence,
  };
}

export function parseFounderIntelligence(input: {
  raw: RawFounderIntelligence;
  status: FounderStatusSnapshotV1;
  nowIso?: string;
}): FounderIntelligenceResult {
  const rawKind = text(input.raw.question_kind, 20).toUpperCase() as FounderQuestionKind;
  const questionKind = KINDS.has(rawKind) ? rawKind : 'GENERAL';
  const allowedAuthorities = new Set(input.status.evidence.map((source) => source.authority));
  const requestedAuthorities = list(input.raw.evidence_authorities, 12, 80);
  const evidenceAuthorities = requestedAuthorities.filter((authority) => allowedAuthorities.has(authority));

  const confidenceRaw = text(input.raw.confidence, 12).toUpperCase();
  let confidence: FounderIntelligenceResult['confidence'] =
    confidenceRaw === 'HIGH' || confidenceRaw === 'MEDIUM' ? confidenceRaw : 'LOW';

  const gaps = list(input.raw.gaps, 8, 400);
  const facts = list(input.raw.facts, 8, 400);
  if (!evidenceAuthorities.length || gaps.length > facts.length) confidence = confidence === 'HIGH' ? 'MEDIUM' : confidence;

  return {
    mode: 'READ_ONLY_ANALYSIS',
    questionKind,
    answer: text(input.raw.answer, 2_200) || 'برای این سؤال شواهد کافی در Founder Status فعلی وجود ندارد.',
    facts,
    gaps,
    nextAction: text(input.raw.next_action, 600) || 'شواهد لازم را کامل کن و تحلیل را دوباره اجرا کن.',
    kpi: text(input.raw.kpi, 400) || 'KPI قابل اتکا از شواهد فعلی تعیین نشد.',
    risks: list(input.raw.risks, 8, 400),
    evidenceAuthorities,
    confidence,
    generatedAt: input.nowIso ?? new Date().toISOString(),
  };
}
