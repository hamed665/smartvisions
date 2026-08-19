export type VariantStrategy = 'problem_first' | 'opportunity_first' | 'direct_idea';

export interface VariantMetrics {
  variantKey: string;
  strategy: VariantStrategy;
  sent: number;
  replies: number;
  positive: number;
  hot: number;
  won: number;
}

function rate(value: number, denominator: number) {
  return denominator > 0 ? value / denominator : 0;
}

export function scoreVariant(metrics: VariantMetrics) {
  return {
    ...metrics,
    replyRate: rate(metrics.replies, metrics.sent),
    positiveRate: rate(metrics.positive, metrics.sent),
    hotRate: rate(metrics.hot, metrics.sent),
    winRate: rate(metrics.won, metrics.sent),
  };
}

export function choosePreferredVariant(variants: VariantMetrics[], minimumSample = 50) {
  const eligible = variants.filter((v) => v.sent >= minimumSample).map(scoreVariant);
  if (eligible.length === 0) return { preferred: null, reason: 'insufficient_sample' as const };

  const sorted = eligible.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.hotRate !== a.hotRate) return b.hotRate - a.hotRate;
    return b.positiveRate - a.positiveRate;
  });

  return { preferred: sorted[0], reason: 'measured_outcome' as const };
}
