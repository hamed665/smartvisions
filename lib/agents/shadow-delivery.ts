import type { AgentContext, AgentResult, CatalogRecommendation, ReplyDraft } from '@/lib/agents/contracts';
import { queueShadowDraft, type ShadowDraftInput } from '@/lib/outreach/shadow-approval';
import { evaluateWhatsAppSendPolicy } from '@/lib/whatsapp/policy';

export type WhatsAppShadowDeliveryContext = {
  conversationId: string;
  to: string;
  marketCode: string;
  leadTimezone?: string;
  lastCustomerMessageAt?: string;
  templateName?: string;
  templateLanguageCode?: string;
};

export type AgentShadowResult = {
  draft: ReplyDraft;
  trace: {
    delivery: 'SEND' | 'REVIEW' | 'BLOCK';
    agentResults: AgentResult[];
  };
  catalogRecommendation: CatalogRecommendation | null;
};

export type AgentShadowApprovalPlan =
  | { action: 'SKIP'; reason: 'DELIVERY_NOT_REVIEW' | 'SHADOW_MODE_OFF' }
  | { action: 'BLOCK'; reason: 'WHATSAPP_POLICY_BLOCKED'; policy: ReturnType<typeof evaluateWhatsAppSendPolicy> }
  | { action: 'QUEUE'; reason: 'SHADOW_REVIEW'; input: ShadowDraftInput; catalogAttached: boolean; policy: ReturnType<typeof evaluateWhatsAppSendPolicy> };

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function operatorFields(results: AgentResult[]) {
  const secretary = results.find((result) => result.agent === 'secretary')?.data as Record<string, unknown> | undefined;
  const culture = results.find((result) => result.agent === 'culture_locale')?.data as Record<string, unknown> | undefined;
  return {
    persianTranslation: stringValue(secretary?.operator_persian_translation),
    persianSummary: stringValue(secretary?.operator_persian_summary),
    replyDialect: stringValue(culture?.reply_dialect) ?? stringValue(culture?.dialect),
  };
}

export function planAgentWhatsAppShadowApproval(input: {
  context: AgentContext;
  result: AgentShadowResult;
  deliveryContext: WhatsAppShadowDeliveryContext;
  requestKey: string;
  now?: Date;
}): AgentShadowApprovalPlan {
  if (input.result.trace.delivery !== 'REVIEW') return { action: 'SKIP', reason: 'DELIVERY_NOT_REVIEW' };
  if (!input.context.shadowMode) return { action: 'SKIP', reason: 'SHADOW_MODE_OFF' };

  const policy = evaluateWhatsAppSendPolicy({
    lastCustomerMessageAt: input.deliveryContext.lastCustomerMessageAt,
    templateName: input.deliveryContext.templateName,
    now: input.now,
  });
  if (!policy.allowed) return { action: 'BLOCK', reason: 'WHATSAPP_POLICY_BLOCKED', policy };

  const operator = operatorFields(input.result.trace.agentResults);
  const catalogContentId = policy.mode === 'FREEFORM'
    ? input.result.catalogRecommendation?.contentId
    : undefined;

  return {
    action: 'QUEUE',
    reason: 'SHADOW_REVIEW',
    catalogAttached: Boolean(catalogContentId),
    policy,
    input: {
      organizationId: input.context.organizationId!,
      conversationId: input.deliveryContext.conversationId,
      leadId: input.context.leadId,
      channel: 'WHATSAPP',
      draft: input.result.draft.text,
      idempotencyKey: `agent:${input.requestKey}:shadow`,
      to: input.deliveryContext.to,
      marketCode: input.deliveryContext.marketCode,
      leadTimezone: input.deliveryContext.leadTimezone,
      lastCustomerMessageAt: input.deliveryContext.lastCustomerMessageAt,
      templateName: input.deliveryContext.templateName,
      templateLanguageCode: input.deliveryContext.templateLanguageCode,
      catalogContentId,
      replyLanguage: input.result.draft.language,
      replyDialect: operator.replyDialect,
      persianTranslation: operator.persianTranslation,
      persianSummary: operator.persianSummary,
    },
  };
}

export async function queueAgentWhatsAppShadowApproval(input: {
  context: AgentContext;
  result: AgentShadowResult;
  deliveryContext: WhatsAppShadowDeliveryContext;
  requestKey: string;
}) {
  const plan = planAgentWhatsAppShadowApproval(input);
  if (plan.action !== 'QUEUE') return { ...plan, queued: false as const };
  const queued = await queueShadowDraft(plan.input);
  return { ...plan, ...queued };
}
