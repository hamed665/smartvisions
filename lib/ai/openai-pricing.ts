type TokenUsage = { inputTokens: number; outputTokens: number };

type Rate = { inputPerMillion: number; outputPerMillion: number };

// Conservative standard short-context rates as of 2026-08-20. Cached-input discounts
// are intentionally ignored so budget accounting errs on the safe side.
const rates: Record<string, Rate> = {
  'gpt-5.6-sol': { inputPerMillion: 2.5, outputPerMillion: 15 },
  'gpt-5.6-terra': { inputPerMillion: 1.25, outputPerMillion: 7.5 },
  'gpt-5.6-luna': { inputPerMillion: 0.5, outputPerMillion: 3 },
  'gpt-5.4': { inputPerMillion: 1.25, outputPerMillion: 7.5 },
  'gpt-5.4-mini': { inputPerMillion: 0.375, outputPerMillion: 2.25 },
  'gpt-5.4-nano': { inputPerMillion: 0.1, outputPerMillion: 0.625 },
};

// Unknown models are deliberately over-estimated rather than recorded as free.
const conservativeFallback: Rate = { inputPerMillion: 15, outputPerMillion: 90 };

export function estimateOpenAiCostUsd(model: string, usage: TokenUsage): number {
  const rate = rates[model] ?? conservativeFallback;
  const input = Math.max(0, usage.inputTokens) / 1_000_000 * rate.inputPerMillion;
  const output = Math.max(0, usage.outputTokens) / 1_000_000 * rate.outputPerMillion;
  return input + output;
}
