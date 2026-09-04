import { describe, expect, it } from 'vitest';
import {
  chooseSafeAutomationRule,
  conversationIdFromMetadata,
  followupStopReason,
  operationalAlertCodeForBudgetMode,
  operationalAutomationAllowed,
  operationalChannelAllowed,
  stableAgentRequestKey,
  type AutomationRuleSnapshot,
} from '@/lib/operations/executor-core';

const baseSafety = {
  leadStatus: 'REPLIED',
  leadAgentMode: 'AUTO',
  conversationStage: 'ACTIVE',
  conversationAgentMode: 'AUTO',
  conversationRequiresHuman: false,
  globalKillSwitch: false,
  agentsPaused: false,
};

describe('operational executor', () => {
  it('uses provider ids for stable channel-scoped agent idempotency', () => {
    expect(stableAgentRequestKey('WHATSAPP', 'wamid.123')).toBe('agent:whatsapp:wamid.123');
    expect(stableAgentRequestKey('email', 'mail_123')).toBe('agent:email:mail_123');
  });

  it('reads both lifecycle metadata conventions', () => {
    expect(conversationIdFromMetadata({ conversationId: 'email-c' })).toBe('email-c');
    expect(conversationIdFromMetadata({ conversation_id: 'wa-c' })).toBe('wa-c');
  });

  it('fails closed for kill switch, human takeover and paused automation', () => {
    expect(operationalAutomationAllowed({ ...baseSafety, globalKillSwitch: true }).allowed).toBe(false);
    expect(operationalAutomationAllowed({ ...baseSafety, leadAgentMode: 'HUMAN' }).allowed).toBe(false);
    expect(operationalAutomationAllowed({ ...baseSafety, conversationRequiresHuman: true }).allowed).toBe(false);
    expect(operationalAutomationAllowed({ ...baseSafety, agentsPaused: true }).allowed).toBe(false);
  });

  it('fails closed for channel-specific pause controls before scheduled AI work', () => {
    expect(operationalChannelAllowed({ channel: 'WHATSAPP', whatsappAiPaused: true }).reason).toBe('WHATSAPP_AI_PAUSED');
    expect(operationalChannelAllowed({ channel: 'EMAIL', emailPaused: true }).reason).toBe('EMAIL_PAUSED');
    expect(operationalChannelAllowed({ channel: 'WHATSAPP', emailPaused: true }).allowed).toBe(true);
    expect(operationalChannelAllowed({ channel: 'EMAIL', whatsappAiPaused: true }).allowed).toBe(true);
  });

  it('stops follow-up when the customer replied at or after last outbound', () => {
    expect(followupStopReason({
      safety: baseSafety,
      lastOutboundAt: '2026-09-04T10:00:00.000Z',
      lastInboundAt: '2026-09-04T10:00:00.000Z',
    })).toBe('CUSTOMER_REPLIED');
  });

  it('does not turn arbitrary automation action_key into a side effect', () => {
    const rules: AutomationRuleSnapshot[] = [{
      id: 'unsafe',
      triggerKey: 'INBOUND_RECEIVED',
      actionKey: 'SEND_DIRECTLY_TO_PROVIDER',
      priority: 100,
      config: {},
    }];
    expect(chooseSafeAutomationRule({ rules, triggerKey: 'INBOUND_RECEIVED', channel: 'EMAIL' }).action).toBe('BLOCKED_UNSAFE_ACTION');
  });

  it('requires a persisted template id before follow-up approval queueing', () => {
    const rules: AutomationRuleSnapshot[] = [{
      id: 'followup',
      triggerKey: 'FOLLOWUP_DUE',
      actionKey: 'QUEUE_TEMPLATE_APPROVAL',
      priority: 80,
      config: {},
    }];
    expect(chooseSafeAutomationRule({ rules, triggerKey: 'FOLLOWUP_DUE', channel: 'EMAIL' }).action).toBe('BLOCKED_INVALID_CONFIG');
  });

  it('uses highest-priority matching safe rule with deterministic conditions', () => {
    const rules: AutomationRuleSnapshot[] = [
      { id: 'low', triggerKey: 'INBOUND_RECEIVED', actionKey: 'SET_STAGE', priority: 10, config: { stage: 'ACTIVE' } },
      { id: 'high', triggerKey: 'INBOUND_RECEIVED', actionKey: 'REQUIRE_HUMAN', priority: 90, config: { channels: ['WHATSAPP'] } },
    ];
    const result = chooseSafeAutomationRule({ rules, triggerKey: 'INBOUND_RECEIVED', channel: 'WHATSAPP' });
    expect(result.action).toBe('REQUIRE_HUMAN');
    expect(result.rule?.id).toBe('high');
  });

  it('maps cost modes to idempotent Telegram alert classes', () => {
    expect(operationalAlertCodeForBudgetMode('NORMAL')).toBeNull();
    expect(operationalAlertCodeForBudgetMode('WARNING')).toBe('COST_WARNING');
    expect(operationalAlertCodeForBudgetMode('THROTTLED')).toBe('COST_THROTTLE');
    expect(operationalAlertCodeForBudgetMode('HARD_STOP')).toBe('COST_CRITICAL');
  });
});
