import { describe, expect, it } from 'vitest';
import { estimateOpenAiCostUsd } from '@/lib/ai/openai-pricing';

describe('estimateOpenAiCostUsd', () => {
  it('uses current Luna rates', () => {
    const cost = estimateOpenAiCostUsd('gpt-5.6-luna', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(1.4, 6);
  });

  it('accounts for cached input separately', () => {
    const cost = estimateOpenAiCostUsd('gpt-5.6-luna', {
      inputTokens: 1_000_000,
      cachedInputTokens: 500_000,
      outputTokens: 0,
    });
    expect(cost).toBeCloseTo(0.11, 6);
  });

  it('uses current Terra and Sol rates', () => {
    expect(estimateOpenAiCostUsd('gpt-5.6-terra', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(14, 6);
    expect(estimateOpenAiCostUsd('gpt-5.6-sol', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(24, 6);
  });

  it('over-estimates unknown models instead of treating them as free', () => {
    const cost = estimateOpenAiCostUsd('unknown-future-model', { inputTokens: 1_000, outputTokens: 1_000 });
    expect(cost).toBeCloseTo(0.105, 6);
  });
});
