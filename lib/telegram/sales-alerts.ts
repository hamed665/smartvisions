import type { AgentContext, AgentResult, PipelineTrace } from '@/lib/agents/contracts';
import type { TelegramNotificationType } from './contracts';

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function classifySalesTelegramAlert(trace: PipelineTrace): TelegramNotificationType | null {
  const reasons = new Set(trace.handoffReasons);
  if (reasons.has('SPECIAL_DISCOUNT')) return 'DISCOUNT_REQUEST';
  if (reasons.has('MEETING_REQUEST')) return 'CONSULTATION_REQUEST';
  if (trace.decision.requiresHuman || reasons.size > 0) return 'SALES_HANDOFF';
  return null;
}

function secretaryData(results: AgentResult[]) {
  const result = results.find((item) => item.agent === 'secretary');
  return asRecord(result?.data);
}

export function buildSalesTelegramAlert(input: {
  context: AgentContext;
  trace: PipelineTrace;
  runId: string;
}) {
  const notificationType = classifySalesTelegramAlert(input.trace);
  if (!notificationType) return null;
  const secretary = secretaryData(input.trace.agentResults);
  const persianSummary = String(secretary.operator_persian_summary ?? '').trim();
  const persianIntent = String(secretary.operator_persian_intent ?? '').trim();
  const reasons = input.trace.handoffReasons.join(', ');
  const title = notificationType === 'DISCOUNT_REQUEST' ? '💬 درخواست تخفیف'
    : notificationType === 'CONSULTATION_REQUEST' ? '📞 درخواست مشاوره / تماس'
    : '🙋 نیاز به ورود انسان';
  const text = [
    title,
    input.context.businessName ? `Business: ${input.context.businessName}` : '',
    input.context.leadId ? `Lead: ${input.context.leadId}` : '',
    `پیام مشتری: ${input.context.message.slice(0, 1000)}`,
    persianSummary ? `خلاصه فارسی: ${persianSummary.slice(0, 900)}` : '',
    persianIntent ? `Intent: ${persianIntent.slice(0, 300)}` : '',
    reasons ? `Reason: ${reasons}` : '',
    `Decision: ${input.trace.decision.action}`,
    'ارسال به مشتری انجام نشده؛ این فقط هشدار مدیریتی است.',
  ].filter(Boolean).join('\n');
  return {
    eventKey: `agent:${input.runId}:sales-alert`,
    notificationType,
    text,
    entityType: input.context.leadId ? 'lead' : 'agent_run',
    entityId: input.context.leadId ?? input.runId,
    payload: {
      runId: input.runId,
      leadId: input.context.leadId ?? null,
      conversationId: input.context.conversationId ?? null,
      handoffReasons: input.trace.handoffReasons,
      decision: input.trace.decision.action,
      outboundTriggered: false,
    },
  };
}
