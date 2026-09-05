import { describe, expect, it } from 'vitest';
import type { AgentContext, AgentName, AgentResult } from '@/lib/agents/contracts';
import type { AgentRuntime } from '@/lib/agents/runtime';
import { checkHumanReplyQuality, processInboundMessage } from '@/lib/agents/pipeline';
import { buildSelectiveRoutePlan } from '@/lib/agents/selective-routing';
import { hasPaymentExecutionIntent } from '@/lib/handoff/policy';

function result(agent: AgentName, data: Record<string, unknown> = {}, blockers: string[] = []): AgentResult {
  return { agent, confidence: 0.95, summary: `${agent} result`, data, evidence: [], blockers };
}

describe('human sales consensus', () => {
  it('feeds specialist consensus to orchestrator, secretary and the real draft to relevance checker', async () => {
    const seen = new Map<AgentName, AgentContext>();
    const runtime: AgentRuntime = {
      async run(agent, context) {
        seen.set(agent, context);
        if (agent === 'sales_marketing') return result(agent, { nextAction: 'ANSWER' });
        if (agent === 'decision_orchestrator') {
          expect(context.collaboration?.specialistResults?.length).toBeGreaterThan(0);
          return result(agent, { recommended_action: 'ANSWER' });
        }
        if (agent === 'secretary') {
          expect(context.collaboration?.specialistResults?.length).toBeGreaterThan(0);
          expect(context.collaboration?.orchestratorResult?.agent).toBe('decision_orchestrator');
          expect(context.collaboration?.commercialDecision?.action).toBe('ANSWER');
          expect(context.conversationHistory?.at(-1)?.body).toContain('website');
          return result(agent, {
            customer_reply: 'Sure. The website service can include booking integration for the clinic. Which booking flow do you use now?',
            customer_reply_language: 'English',
          });
        }
        if (agent === 'relevance_checker') {
          expect(context.collaboration?.proposedReply?.text).toContain('booking integration');
          return result(agent);
        }
        return result(agent);
      },
    };

    const output = await processInboundMessage({
      organizationId: 'org',
      leadId: 'lead',
      businessName: 'Pearl Clinic',
      countryCode: 'OM',
      language: 'en',
      industry: 'clinic',
      message: 'Can you explain the website service and booking integration?',
      conversationSummary: 'The customer previously asked about a website.',
      conversationHistory: [
        { direction: 'INBOUND', body: 'I need help with my clinic website.' },
        { direction: 'OUTBOUND', body: 'Sure, I can explain it.' },
        { direction: 'INBOUND', body: 'Tell me more about the website.' },
      ],
      shadowMode: true,
      agentMode: 'AUTO',
    }, undefined, runtime);

    expect(output.trace.reasoningTier).toBe('FULL');
    expect(seen.has('decision_orchestrator')).toBe(true);
    expect(seen.has('secretary')).toBe(true);
    expect(seen.has('relevance_checker')).toBe(true);
    expect(output.trace.relevancePassed).toBe(true);
    expect(output.trace.humanStylePassed).toBe(true);
    expect(output.trace.delivery).toBe('REVIEW');
  });

  it('uses only one paid agent call for routine LIGHT replies', async () => {
    const paidCalls: AgentName[] = [];
    const runtime: AgentRuntime = {
      async run(agent) {
        paidCalls.push(agent);
        return result(agent, agent === 'secretary' ? {
          customer_reply: 'Sure. We can tailor the website around what the business actually needs.',
          customer_reply_language: 'English',
        } : {});
      },
    };

    const output = await processInboundMessage({
      message: 'Tell me about your website service',
      countryCode: 'OM',
      agentMode: 'AUTO',
      shadowMode: true,
    }, undefined, runtime);

    expect(output.trace.reasoningTier).toBe('LIGHT');
    expect(output.trace.paidAgentCallsPlanned).toBe(1);
    expect(paidCalls).toEqual(['secretary']);
  });

  it('keeps a nonbinding trial-and-contract inquiry in automation instead of permanent HUMAN takeover', async () => {
    const runtime: AgentRuntime = {
      async run(agent) {
        if (agent === 'sales_marketing') return result(agent, { nextAction: 'ANSWER' });
        if (agent === 'decision_orchestrator') return result(agent, { recommended_action: 'ANSWER' });
        if (agent === 'secretary') return result(agent, {
          customer_reply: 'We do not have a verified single-content trial or contract term in the standard packages. I can explain the verified content packages, and custom terms can be reviewed separately if needed.',
          customer_reply_language: 'English',
        });
        return result(agent);
      },
    };

    const output = await processInboundMessage({
      message: "I just one content to test you if it's ok contract",
      countryCode: 'OM',
      agentMode: 'AUTO',
      shadowMode: true,
      verifiedEvidence: ['No verified single-content trial or custom contract terms are configured.'],
    }, undefined, runtime);

    expect(hasPaymentExecutionIntent("I just one content to test you if it's ok contract")).toBe(false);
    expect(output.trace.handoffReasons).not.toContain('PAYMENT_DISCUSSION');
    expect(output.nextAgentMode).toBe('AUTO');
    expect(output.trace.delivery).toBe('REVIEW');
  });

  it('still identifies explicit payment or contract execution as human-required', () => {
    expect(hasPaymentExecutionIntent('How can I pay? Send me an invoice.')).toBe(true);
    expect(hasPaymentExecutionIntent('Please send me the contract to sign.')).toBe(true);
    expect(hasPaymentExecutionIntent('Can you explain what is included in the contract?')).toBe(false);
  });

  it('routes discount objections through psychology and hands them to a human', async () => {
    const plan = buildSelectiveRoutePlan({ message: 'Can you give me a better price or discount?', quotedPrice: 300, quotedCurrency: 'OMR' });
    expect(plan.tier).toBe('FULL');
    expect(plan.agents).toContain('conversation_psychology');

    const runtime: AgentRuntime = {
      async run(agent) {
        if (agent === 'sales_marketing') return result(agent, { nextAction: 'ANSWER' });
        if (agent === 'secretary') return result(agent, { customer_reply: 'I can check the available pricing options for you.', customer_reply_language: 'English' });
        return result(agent);
      },
    };

    const output = await processInboundMessage({
      message: 'Can you give me a better price or discount?',
      quotedPrice: 300,
      quotedCurrency: 'OMR',
      agentMode: 'AUTO',
      shadowMode: false,
    }, undefined, runtime);

    expect(output.trace.handoffReasons).toContain('SPECIAL_DISCOUNT');
    expect(output.nextAgentMode).toBe('HUMAN');
    expect(output.trace.delivery).toBe('BLOCK');
  });

  it('flags robotic corporate replies before they can auto-send', () => {
    const quality = checkHumanReplyQuality({
      text: 'Thank you for reaching out! We would be delighted to assist you! What service do you need? What budget do you have?',
      language: 'en',
      generatedBy: 'secretary',
    });
    expect(quality.passed).toBe(false);
    expect(quality.reasons).toContain('CORPORATE_BOILERPLATE');
    expect(quality.reasons).toContain('TOO_MANY_QUESTIONS');
  });
});
