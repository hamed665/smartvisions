import { describe, expect, it } from 'vitest';
import { routeAiTask } from '@/lib/ai/model-router';
import {
  freeOwnerAssistantReply,
  parseOwnerAssistantPlan,
  redactOwnerAssistantContext,
  shouldUseOwnerAssistantPlanner,
} from '@/lib/telegram/assistant-planner-core';
import { parseTelegramOwnerCommand } from '@/lib/telegram/parser';

const routing = {
  model_routing_enabled: true,
  low_cost_model: 'gpt-5.6-luna',
  high_reasoning_model: 'gpt-5.6-terra',
};

describe('Telegram conversational owner copilot', () => {
  it('keeps known commands deterministic and sends only unknown language to the planner', () => {
    expect(shouldUseOwnerAssistantPlanner('وضعیت سیستم چطوره؟', parseTelegramOwnerCommand('وضعیت سیستم چطوره؟'))).toBe(false);
    expect(shouldUseOwnerAssistantPlanner('چرا امروز خروجی کمتر از هدف بوده؟', parseTelegramOwnerCommand('چرا امروز خروجی کمتر از هدف بوده؟'))).toBe(true);
    expect(shouldUseOwnerAssistantPlanner('کمک', parseTelegramOwnerCommand('کمک'))).toBe(false);
    expect(shouldUseOwnerAssistantPlanner('/help@SmartVisionsOwnerBot', parseTelegramOwnerCommand('/help@SmartVisionsOwnerBot'))).toBe(false);
  });

  it('answers greetings without a paid model call', () => {
    expect(freeOwnerAssistantReply('سلام')?.reason).toBe('DETERMINISTIC_GREETING');
    expect(freeOwnerAssistantReply('مرسی')?.reason).toBe('DETERMINISTIC_THANKS');
    expect(freeOwnerAssistantReply('کمپین را بررسی کن')).toBeNull();
  });

  it('accepts only registered canonical commands from the model', () => {
    const plan = parseOwnerAssistantPlan({
      mode: 'COMMAND',
      canonical_command: '/budget',
      answer: '',
      importance: 'NORMAL',
      reason: 'BUDGET_READ',
    }, 'بودجه چقدره؟');
    expect(plan.mode).toBe('COMMAND');
    if (plan.mode === 'COMMAND') expect(plan.command.type).toBe('SHOW_BUDGET');

    const blocked = parseOwnerAssistantPlan({
      mode: 'COMMAND',
      canonical_command: '/shell rm -rf',
      answer: '',
      importance: 'NORMAL',
      reason: 'BAD',
    }, 'هر کاری لازم است بکن');
    expect(blocked.mode).toBe('BLOCKED');
  });

  it('refuses model-inferred writes when the owner did not explicitly request a change', () => {
    const plan = parseOwnerAssistantPlan({
      mode: 'COMMAND',
      canonical_command: '/limit openai 8',
      answer: '',
      importance: 'IMPORTANT',
      reason: 'BUDGET',
    }, 'بودجه OpenAI الان چقدره؟');
    expect(plan.mode).toBe('CLARIFY');
  });

  it('does not treat a generic inspection request as write authorization', () => {
    const plan = parseOwnerAssistantPlan({
      mode: 'COMMAND',
      canonical_command: '/market OM off',
      answer: '',
      importance: 'IMPORTANT',
      reason: 'MARKET',
    }, 'کمپین عمان را بررسی کن');
    expect(plan.mode).toBe('CLARIFY');
  });

  it('allows explicit writes but still leaves execution to Preview and confirmation', () => {
    const plan = parseOwnerAssistantPlan({
      mode: 'COMMAND',
      canonical_command: '/limit openai 8',
      answer: '',
      importance: 'IMPORTANT',
      reason: 'BUDGET',
    }, 'بودجه OpenAI را 8 دلار کن');
    expect(plan.mode).toBe('COMMAND');
    if (plan.mode === 'COMMAND') expect(plan.command.type).toBe('SET_COST_LIMIT');
  });

  it('never permits the model to trigger the owner alert self-test', () => {
    const plan = parseOwnerAssistantPlan({
      mode: 'COMMAND',
      canonical_command: '/alert_test',
      answer: '',
      importance: 'NORMAL',
      reason: 'TEST',
    }, 'هشدار را تست کن');
    expect(plan.mode).toBe('BLOCKED');
  });

  it('redacts common credential shapes before model context is built', () => {
    const redacted = redactOwnerAssistantContext('token=123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ api_key=secret-value eyJabcdefghijklmnopqrstuv.abcdefghijklmnop.qwertyuiopasdfgh');
    expect(redacted).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(redacted).not.toContain('secret-value');
    expect(redacted).not.toContain('eyJabcdefghijklmnopqrstuv');
    expect(redacted).toContain('[REDACTED');
  });

  it('routes ordinary owner chat to Luna and explicit deep analysis to Terra', () => {
    expect(routeAiTask('OWNER_ASSISTANT', 'NORMAL', routing).tier).toBe('LOW_COST');
    expect(routeAiTask('OWNER_ASSISTANT', 'NORMAL', routing).modelOverride).toBe('gpt-5.6-luna');
    expect(routeAiTask('OWNER_ANALYSIS', 'NORMAL', routing).tier).toBe('HIGH_REASONING');
    expect(routeAiTask('OWNER_ANALYSIS', 'NORMAL', routing).modelOverride).toBe('gpt-5.6-terra');
    expect(routeAiTask('OWNER_ANALYSIS', 'THROTTLED', routing).tier).toBe('LOW_COST');
  });
});
