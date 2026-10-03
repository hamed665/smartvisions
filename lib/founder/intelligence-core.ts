import type { FounderStatusSnapshotV1 } from './contracts';
import { buildFounderInvestorReadinessV1 } from './investor-readiness';
import { normalizeOwnerWebUrl, type OwnerWebSource } from '@/lib/ai/owner-web-research-core';
import { founderFinanceModelPayload, founderFinanceVerifiedAuthorities, type FounderFinanceV1 } from './finance';
import { founderInvestorModelPayload, founderInvestorVerifiedAuthorities, type FounderInvestorWorkspaceV1 } from './investor';
import { founderCapitalModelPayload, founderCapitalVerifiedAuthorities, type FounderCapitalWorkspaceV1 } from './capital';

export type FounderQuestionKind =
  | 'STATUS'
  | 'NEXT'
  | 'DECISION'
  | 'PRICING'
  | 'MARKET'
  | 'INVESTOR'
  | 'RISK'
  | 'GENERAL';

export type FounderGroundedFact = {
  text: string;
  authority: string;
};

export type FounderExternalFact = {
  text: string;
  sourceUrl: string;
};

export type FounderExternalSource = {
  url: string;
  title?: string;
};

export type FounderIntelligenceResult = {
  mode: 'READ_ONLY_ANALYSIS';
  questionKind: FounderQuestionKind;
  answer: string;
  facts: FounderGroundedFact[];
  externalFacts: FounderExternalFact[];
  externalSources: FounderExternalSource[];
  researchMode: 'INTERNAL_ONLY' | 'LIVE_WEB';
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
  external_facts?: unknown;
  gaps?: unknown;
  next_action?: unknown;
  kpi?: unknown;
  risks?: unknown;
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

function verifiedAuthorities(
  status: FounderStatusSnapshotV1,
  finance?: FounderFinanceV1 | null,
  investor?: FounderInvestorWorkspaceV1 | null,
  capital?: FounderCapitalWorkspaceV1 | null,
) {
  return new Set([
    ...status.evidence
      .filter((source) => source.quality === 'VERIFIED')
      .map((source) => source.authority),
    ...founderFinanceVerifiedAuthorities(finance),
    ...founderInvestorVerifiedAuthorities(investor),
    ...founderCapitalVerifiedAuthorities(capital),
  ]);
}


function externalFacts(
  value: unknown,
  webSources: OwnerWebSource[],
  maxItems = 8,
): FounderExternalFact[] {
  if (!Array.isArray(value) || !webSources.length) return [];
  const allowed = new Set(
    webSources
      .map((source) => normalizeOwnerWebUrl(source.url))
      .filter((url): url is string => Boolean(url)),
  );
  const seen = new Set<string>();
  const facts: FounderExternalFact[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const factText = text(row.text, 500);
    const sourceUrl = normalizeOwnerWebUrl(row.source_url);
    if (!factText || !sourceUrl || !allowed.has(sourceUrl)) continue;
    const key = `${sourceUrl}\u0000${factText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ text: factText, sourceUrl });
    if (facts.length >= maxItems) break;
  }
  return facts;
}

function normalizedWebSources(webSources: OwnerWebSource[]): FounderExternalSource[] {
  const seen = new Set<string>();
  const output: FounderExternalSource[] = [];
  for (const source of webSources) {
    const url = normalizeOwnerWebUrl(source.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = text(source.title, 240);
    output.push(title ? { url, title } : { url });
    if (output.length >= 16) break;
  }
  return output;
}

function groundedFacts(
  value: unknown,
  status: FounderStatusSnapshotV1,
  finance?: FounderFinanceV1 | null,
  investor?: FounderInvestorWorkspaceV1 | null,
  capital?: FounderCapitalWorkspaceV1 | null,
  maxItems = 8,
): FounderGroundedFact[] {
  if (!Array.isArray(value)) return [];
  const allowed = verifiedAuthorities(status, finance, investor, capital);
  const seen = new Set<string>();
  const facts: FounderGroundedFact[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const factText = text(row.text, 400);
    const authority = text(row.authority, 80);
    if (!factText || !allowed.has(authority)) continue;
    const key = `${authority}\u0000${factText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push({ text: factText, authority });
    if (facts.length >= maxItems) break;
  }
  return facts;
}

export function needsLiveFounderResearch(question: string) {
  return /(بازار|market|competitor|رقیب|رقبا|benchmark|بنچمارک|tams?|sams?|soms?|market\s*size|اندازه\s*بازار|current\s*pricing|قیمت\s*(?:رقبا|بازار)|pricing\s*(?:competitor|market)|regulation|قانون|مقررات|investor\s*(?:list|search|fund)|سرمایه(?:‌| )?گذار(?:ان)?\s*(?:مناسب|پیدا|لیست)|trend|ترند|اخبار|news)/i.test(question);
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

export function founderStatusModelPayload(
  status: FounderStatusSnapshotV1,
  finance?: FounderFinanceV1 | null,
  investor?: FounderInvestorWorkspaceV1 | null,
  capital?: FounderCapitalWorkspaceV1 | null,
) {
  return {
    schemaVersion: status.schemaVersion,
    mode: status.mode,
    generatedAt: status.generatedAt,
    operatingMode: status.operatingMode,
    product: status.product,
    sales: status.sales,
    providerCostGuard: status.finance,
    founderFinance: founderFinanceModelPayload(finance),
    founderInvestor: founderInvestorModelPayload(investor),
    founderCapital: founderCapitalModelPayload(capital),
    attention: status.attention,
    evidence: [
      ...status.evidence,
      ...(finance?.evidence ?? []),
      ...(investor?.evidence ?? []),
      ...(capital?.evidence ?? []),
    ],
    investorReadiness: buildFounderInvestorReadinessV1(status, finance, investor, capital),
  };
}

export function parseFounderIntelligence(input: {
  raw: RawFounderIntelligence;
  status: FounderStatusSnapshotV1;
  webSources?: OwnerWebSource[];
  finance?: FounderFinanceV1 | null;
  investor?: FounderInvestorWorkspaceV1 | null;
  capital?: FounderCapitalWorkspaceV1 | null;
  nowIso?: string;
}): FounderIntelligenceResult {
  const rawKind = text(input.raw.question_kind, 20).toUpperCase() as FounderQuestionKind;
  const questionKind = KINDS.has(rawKind) ? rawKind : 'GENERAL';
  const facts = groundedFacts(input.raw.facts, input.status, input.finance, input.investor, input.capital);
  const webSources = normalizedWebSources(input.webSources ?? []);
  const acceptedExternalFacts = externalFacts(input.raw.external_facts, webSources);
  const evidenceAuthorities = [...new Set(facts.map((fact) => fact.authority))];

  const confidenceRaw = text(input.raw.confidence, 12).toUpperCase();
  let confidence: FounderIntelligenceResult['confidence'] =
    confidenceRaw === 'HIGH' || confidenceRaw === 'MEDIUM' ? confidenceRaw : 'LOW';

  const gaps = list(input.raw.gaps, 8, 400);
  const supportedFactCount = facts.length + acceptedExternalFacts.length;
  if (!supportedFactCount || gaps.length > supportedFactCount) {
    confidence = confidence === 'HIGH' ? 'MEDIUM' : confidence;
  }

  return {
    mode: 'READ_ONLY_ANALYSIS',
    questionKind,
    answer: text(input.raw.answer, 2_200) || 'برای این سؤال شواهد کافی در Founder Status فعلی وجود ندارد.',
    facts,
    externalFacts: acceptedExternalFacts,
    externalSources: webSources,
    researchMode: webSources.length ? 'LIVE_WEB' : 'INTERNAL_ONLY',
    gaps,
    nextAction: text(input.raw.next_action, 600) || 'شواهد لازم را کامل کن و تحلیل را دوباره اجرا کن.',
    kpi: text(input.raw.kpi, 400) || 'KPI قابل اتکا از شواهد فعلی تعیین نشد.',
    risks: list(input.raw.risks, 8, 400),
    evidenceAuthorities,
    confidence,
    generatedAt: input.nowIso ?? new Date().toISOString(),
  };
}
