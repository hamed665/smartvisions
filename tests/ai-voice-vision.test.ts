import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { routeAiTask } from '@/lib/ai/model-router';
import { normalizeMediaAnalysisOutput } from '@/lib/media/understanding';

const routeSource = readFileSync('app/api/ai/process-inbound/route.ts', 'utf8');
const understandingSource = readFileSync('lib/media/understanding.ts', 'utf8');
const preprocessSource = readFileSync('lib/media/preprocess.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20261003212542_ai_voice_vision.sql', 'utf8');

describe('AI-VOICE-VISION', () => {
  it('keeps media understanding on the existing low-cost model router', () => {
    const route = routeAiTask('MEDIA_UNDERSTANDING', 'NORMAL', {
      model_routing_enabled: true,
      low_cost_model: 'gpt-5.6-luna',
      high_reasoning_model: 'gpt-5.6-terra',
    });
    expect(route).toMatchObject({
      tier: 'LOW_COST',
      modelOverride: 'gpt-5.6-luna',
      allowDeepReasoning: false,
    });
  });

  it('bounds normalized provider output before it can become conversation evidence', () => {
    const result = normalizeMediaAnalysisOutput({
      summary: ' visible evidence '.padEnd(4000, 'x'),
      extractedText: 'a'.repeat(20000),
      confidence: 4,
      detectedLanguage: 'en'.repeat(30),
      safetyNotes: Array.from({ length: 20 }, (_, index) => 'note-' + index),
    });

    expect(result.summary.length).toBeLessThanOrEqual(3000);
    expect(result.extractedText.length).toBeLessThanOrEqual(12000);
    expect(result.detectedLanguage.length).toBeLessThanOrEqual(40);
    expect(result.confidence).toBe(1);
    expect(result.safetyNotes).toHaveLength(8);
  });

  it('preprocesses bounded canonical media before Agent context hydration', () => {
    const preprocessAt = routeSource.indexOf('prepareLatestInboundMediaForAi({');
    const hydrateAt = routeSource.indexOf('hydrateAgentContext({');
    expect(preprocessAt).toBeGreaterThan(0);
    expect(hydrateAt).toBeGreaterThan(preprocessAt);
    expect(preprocessSource).toContain(".from('conversation_messages')");
    expect(preprocessSource).toContain("VIDEO_UNDERSTANDING_REQUIRED_BEFORE_AI_REPLY");
    expect(preprocessSource).not.toMatch(/from\(['"](?:media_store|media_analysis_store|ai_media_store)['"]\)/);
  });

  it('reuses tenant media download, Cost Guard and Responses API without a provider-send path', () => {
    expect(understandingSource).toContain('downloadMetaWhatsAppMediaForChatwoot');
    expect(understandingSource).toContain('resolveMetaWhatsAppProvider');
    expect(understandingSource).toContain("routeAiTask('MEDIA_UNDERSTANDING'");
    expect(understandingSource).toContain('reserveCostGuardUsage');
    expect(understandingSource).toContain("https://api.openai.com/v1/responses");
    expect(understandingSource).toContain("type: 'input_image'");
    expect(understandingSource).toContain("type: 'input_file'");
    expect(understandingSource).toContain('file_data: `data:${input.mimeType};base64,${encoded}`');
    expect(understandingSource).not.toMatch(/send(?:Text|Media|Audio|Message)\s*\(/);
  });

  it('keeps paid media analysis replay-safe around the provider boundary', () => {
    expect(understandingSource).toContain("rpc('claim_conversation_media_analysis'");
    expect(understandingSource).toContain("rpc('mark_conversation_media_analysis_provider_started'");
    expect(understandingSource).toContain("status: 'RECONCILIATION_REQUIRED'");
    expect(understandingSource).toContain('automaticRetry: false');
    expect(understandingSource).toContain('.slice(0, 200)');
    expect(understandingSource).toContain('settleAcceptedMediaUsage');
    expect(understandingSource).toContain('COST_GUARD_SETTLEMENT_FAILED');
    expect(understandingSource).toContain('OPENAI_RESPONSE_PARSE_FAILED');
  });

  it('keeps canonical conversation_messages as the only media evidence authority', () => {
    expect(migration).toContain('public.conversation_messages');
    expect(migration).not.toMatch(/create\s+table/i);
    expect(migration).toContain('security invoker');
    expect(migration).toContain('grant execute on function public.claim_conversation_media_analysis');
    expect(migration).toContain('to service_role');
    expect(migration).toContain('AI media evidence is trusted-server managed');
  });
});
