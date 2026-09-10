type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
};

type Rate = {
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
};

// Current standard short-context rates verified against the official OpenAI model
// pricing documentation on 2026-09-10. Long-context multipliers (>272K input) are intentionally
// not modeled here because Growth OS enforces compact per-agent context far below
// that threshold. Cached input is tracked when the Responses API reports it.
const rates: Record<string, Rate> = {
  'gpt-5.6-sol': { inputPerMillion: 4, cachedInputPerMillion: 0.4, outputPerMillion: 20 },
  'gpt-5.6': { inputPerMillion: 4, cachedInputPerMillion: 0.4, outputPerMillion: 20 },
  'gpt-5.6-terra': { inputPerMillion: 1, cachedInputPerMillion: 0.1, outputPerMillion: 6 },
  'gpt-5.6-luna': { inputPerMillion: 0.1, cachedInputPerMillion: 0.01, outputPerMillion: 0.6 },
  'gpt-5.4': { inputPerMillion: 2.5, cachedInputPerMillion: 0.25, outputPerMillion: 15 },
  'gpt-5.4-mini': { inputPerMillion: 0.75, cachedInputPerMillion: 0.075, outputPerMillion: 4.5 },
  'gpt-5.4-nano': { inputPerMillion: 0.2, cachedInputPerMillion: 0.02, outputPerMillion: 1.25 },
};

// Unknown models are deliberately over-estimated rather than recorded as free.
const conservativeFallback: Rate = {
  inputPerMillion: 15,
  cachedInputPerMillion: 15,
  outputPerMillion: 90,
};

export function estimateOpenAiCostUsd(model: string, usage: TokenUsage): number {
  const rate = rates[model] ?? conservativeFallback;
  const totalInputTokens = Math.max(0, usage.inputTokens);
  const cachedInputTokens = Math.min(totalInputTokens, Math.max(0, usage.cachedInputTokens ?? 0));
  const uncachedInputTokens = totalInputTokens - cachedInputTokens;
  const outputTokens = Math.max(0, usage.outputTokens);

  return (
    uncachedInputTokens / 1_000_000 * rate.inputPerMillion
    + cachedInputTokens / 1_000_000 * rate.cachedInputPerMillion
    + outputTokens / 1_000_000 * rate.outputPerMillion
  );
}

export function estimateOpenAiReservationUsd(model: string, serializedRequestBytes: number, maxOutputTokens: number): number {
  // A token cannot encode less than one byte of the UTF-8 request. Treat every
  // serialized request byte as one uncached input token and every allowed output
  // token as consumed. This deliberately over-reserves before the call, then the
  // reservation is settled down to the provider-reported token usage afterward.
  return estimateOpenAiCostUsd(model, {
    inputTokens: Math.max(1, Math.ceil(serializedRequestBytes)),
    outputTokens: Math.max(1, Math.ceil(maxOutputTokens)),
    cachedInputTokens: 0,
  });
}
