import { describe, expect, it } from 'vitest';
import { routeAiTask } from '@/lib/ai/model-router';

describe('OpenAI health-check routing', () => {
  it('keeps classification on the low-cost tier', () => {
    const route = routeAiTask('CLASSIFY', 'NORMAL', {
      model_routing_enabled: true,
      low_cost_model: 'gpt-5.6-luna',
      high_reasoning_model: 'gpt-5.6-terra',
    });
    expect(route.tier).toBe('LOW_COST');
    expect(route.modelOverride).toBe('gpt-5.6-luna');
    expect(route.allowDeepReasoning).toBe(false);
  });
});
