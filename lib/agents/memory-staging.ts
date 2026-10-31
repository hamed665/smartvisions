import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentContext } from './contracts';

/** An exact customer turn is proposed for review, never promoted to trusted facts. */
export async function stageCompletedRunMemory(input: {
  supabase: SupabaseClient;
  organizationId: string;
  runId: string;
  context: AgentContext;
}) {
  const { context, supabase, organizationId, runId } = input;
  const latest = [...(context.conversationHistory ?? [])].reverse()
    .find(turn => turn.direction === 'INBOUND' && turn.senderType === 'CUSTOMER');
  // Only canonical, scoped, timestamped evidence; greetings and caller-only text add no Memory.
  if (!context.conversationId || !latest?.sourceId || latest.scope !== 'CONVERSATION'
    || latest.body.trim().length < 24 || latest.body.trim() !== context.message?.trim()
    || !latest.at || !Number.isFinite(Date.parse(latest.at))) return { status: 'SKIPPED' as const };
  const observed = new Date(latest.at);
  const expires = new Date(observed.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  if (Date.parse(expires) <= Date.now()) return { status: 'SKIPPED' as const };
  try {
    const { error } = await supabase.rpc('stage_memory_item_v2', {
      p_organization_id: organizationId,
      p_actor_type: 'SYSTEM', p_actor_user_id: null,
      p_memory_key: `conversation.customer_turn:${runId}`,
      p_memory_type: 'EPISODIC',
      p_payload: { text: latest.body.slice(0, 1600), interpretation: 'CUSTOMER_REPORTED_UNVERIFIED' },
      p_source_type: 'AGENT_RUNTIME', p_source_ref: runId,
      p_source_evidence: { sourceId: latest.sourceId, channel: latest.channel, evidenceKind: 'EXACT_CUSTOMER_TURN', explicitReviewRequired: true },
      p_confidence: 1, // Confidence in the recorded quotation, not in its factual truth.
      p_observed_at: observed.toISOString(),
      p_fresh_until: new Date(observed.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      p_sensitivity: 'CONFIDENTIAL', p_valid_from: observed.toISOString(), p_valid_until: null,
      p_expires_at: expires, p_person_id: null, p_business_id: null,
      p_conversation_id: context.conversationId,
      p_supersedes_memory_id: null, p_correction_reason: null,
      p_request_key: `agent-memory:${runId}`,
    });
    if (error) return { status: 'RECONCILIATION_REQUIRED' as const };
    return { status: 'PENDING_REVIEW' as const };
  } catch {
    // A secondary Memory failure must not fail/retry an already-completed paid run.
    return { status: 'RECONCILIATION_REQUIRED' as const };
  }
}
