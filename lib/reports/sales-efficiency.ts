type JsonRecord = Record<string, unknown>;

export type SalesEfficiencyAgentRun = {
  status?: string | null;
  result_payload?: unknown;
};

export type SalesEfficiencySummary = {
  evaluatedDrafts: number;
  policyPassedDrafts: number;
  policyPassRate: number | null;
  averageWords: number | null;
  averageQuestions: number | null;
  directPriceRequired: number;
  directPriceAnswered: number;
  readyToStartSignals: number;
  avoidableQualificationBlocks: number;
  marketWordLimitBlocks: number;
  canonicalPriceMissBlocks: number;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanValue(value: unknown) {
  return value === true ? true : value === false ? false : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

export function buildSalesEfficiencySummary(runs: SalesEfficiencyAgentRun[]): SalesEfficiencySummary {
  const samples = runs.flatMap((run) => {
    if (String(run.status ?? '').toUpperCase() !== 'COMPLETED') return [];
    const payload = record(run.result_payload);
    const trace = record(payload.trace);
    const efficiency = record(trace.salesEfficiency);
    if (!Object.keys(efficiency).length) return [];

    const policyPassed = booleanValue(efficiency.policyPassed);
    const wordCount = finiteNumber(efficiency.wordCount);
    const questionCount = finiteNumber(efficiency.questionCount);
    const directPriceAnswerRequired = booleanValue(efficiency.directPriceAnswerRequired);
    const directPriceAnswered = booleanValue(efficiency.directPriceAnswered);
    const readyToStart = booleanValue(efficiency.readyToStart);
    if (policyPassed == null || wordCount == null || questionCount == null
      || directPriceAnswerRequired == null || directPriceAnswered == null || readyToStart == null) return [];

    return [{
      policyPassed,
      wordCount,
      questionCount,
      directPriceAnswerRequired,
      directPriceAnswered,
      readyToStart,
      guardrails: stringArray(trace.guardrails),
    }];
  });

  const evaluatedDrafts = samples.length;
  const policyPassedDrafts = samples.filter((sample) => sample.policyPassed).length;
  const directPriceRequired = samples.filter((sample) => sample.directPriceAnswerRequired).length;
  const directPriceAnswered = samples.filter((sample) => sample.directPriceAnswerRequired && sample.directPriceAnswered).length;
  const readyToStartSignals = samples.filter((sample) => sample.readyToStart).length;
  const qualificationReasons = new Set([
    'UNNECESSARY_LOCATION_QUESTION',
    'UNNECESSARY_DATE_QUESTION',
    'UNNECESSARY_BUDGET_QUESTION',
    'UNNECESSARY_DECISION_MAKER_QUESTION',
    'REPEATED_KNOWN_LOCATION_QUESTION',
    'REPEATED_KNOWN_DATE_QUESTION',
    'REPEATED_KNOWN_BUDGET_QUESTION',
    'REPEATED_KNOWN_DELIVERABLE_QUESTION',
    'QUALIFICATION_AFTER_READY_TO_START',
  ]);

  return {
    evaluatedDrafts,
    policyPassedDrafts,
    policyPassRate: pct(policyPassedDrafts, evaluatedDrafts),
    averageWords: evaluatedDrafts
      ? Math.round((samples.reduce((sum, sample) => sum + sample.wordCount, 0) / evaluatedDrafts) * 10) / 10
      : null,
    averageQuestions: evaluatedDrafts
      ? Math.round((samples.reduce((sum, sample) => sum + sample.questionCount, 0) / evaluatedDrafts) * 10) / 10
      : null,
    directPriceRequired,
    directPriceAnswered,
    readyToStartSignals,
    avoidableQualificationBlocks: samples.filter((sample) => sample.guardrails.some((reason) => qualificationReasons.has(reason))).length,
    marketWordLimitBlocks: samples.filter((sample) => sample.guardrails.includes('REPLY_EXCEEDS_MARKET_WORD_LIMIT')).length,
    canonicalPriceMissBlocks: samples.filter((sample) => sample.guardrails.includes('MISSES_CANONICAL_PRICE_ANSWER')).length,
  };
}
