import { describe, expect, it } from 'vitest';
import { estimateOpenAiCostUsd } from '@/lib/ai/openai-pricing';

describe('estimateOpenAiCostUsd', () => {
  it('uses configured Luna rates', () => {
    const cost = estimateOpenAiCostUsd('gpt-5.6-luna', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(3.5, 6);
  });

  it('over-estimates unknown models instead of treating them as free', () => {
    const cost = estimateOpenAiCostUsd('unknown-future-model', { inputTokens: 1_000, outputTokens: 1_000 });
    expect(cost).toBeCloseTo(0.105, 6);
  });
});
