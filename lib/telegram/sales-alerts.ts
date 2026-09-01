import type { AgentContext, AgentResult, PipelineTrace } from '@/lib/agents/contracts';
import type { TelegramNotificationType } from './contracts';

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const scalar = (value: unknown) => ['string','number'].includes(typeof value) && String(value).trim() ? String(value).trim() : '';

export function classifySalesTelegramAlert(trace: PipelineTrace, context?: AgentContext): TelegramNotificationType | null {
  const reasons = new Set(trace.handoffReasons);
  if (reasons.has('SPECIAL_DISCOUNT')) return 'DISCOUNT_REQUEST';
  if (reasons.has('MEETING_REQUEST')) return 'CONSULTATION_REQUEST';
  if (trace.decision.requiresHuman || reasons.size > 0) return 'SALES_HANDOFF';
  if (context?.stage === 'HOT') return 'HOT_LEAD';
  return null;
}

function agentData(results: AgentResult[], agent: AgentResult['agent']) {
  return asRecord(results.find((item) => item.agent === agent)?.data);
}

function firstScalar(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = scalar(record[key]);
    if (value) return value;
  }
  return '';
}

function nextAction(type: TelegramNotificationType) {
  if (type === 'DISCOUNT_REQUEST') return 'Owner باید درخواست را با floor و approval rule مقایسه کند؛ هیچ تخفیفی خودکار اعمال نشود.';
  if (type === 'CONSULTATION_REQUEST') return 'Owner زمان/روش تماس را مشخص کند؛ Agent بدون هماهنگی جلسه‌ای وعده ندهد.';
  if (type === 'SALES_HANDOFF') return 'مکالمه در حالت Human بماند و پاسخ بعدی توسط Owner بررسی شود.';
  if (type === 'HOT_LEAD') return 'Lead را سریع مرور کن و مناسب‌ترین next step انسانی را انتخاب کن.';
  return 'Lead را بررسی کن.';
}

export function buildSalesTelegramAlert(input: {
  context: AgentContext;
  trace: PipelineTrace;
  runId: string;
}) {
  const notificationType = classifySalesTelegramAlert(input.trace, input.context);
  if (!notificationType) return null;

  const secretary = agentData(input.trace.agentResults, 'secretary');
  const intent = agentData(input.trace.agentResults, 'intent_discovery');
  const persianSummary = String(secretary.operator_persian_summary ?? '').trim();
  const persianIntent = String(secretary.operator_persian_intent ?? '').trim();
  const requestedPrice = firstScalar(intent, ['requested_price','requestedPrice','target_price','targetPrice','budget']);
  const requestedDiscount = firstScalar(intent, ['requested_discount_pct','requestedDiscountPct','requested_discount','requestedDiscount','discount']);
  const reasons = input.trace.handoffReasons.join(', ');
  const serviceId = input.trace.decision.serviceId ?? input.context.quotedService;
  const service = serviceId ? input.context.serviceKnowledge?.find((item) => item.id === serviceId) : undefined;
  const marketPrice = service?.marketPrice;
  const currentPrice = marketPrice?.price ?? input.context.quotedPrice;
  const currency = marketPrice?.currency ?? input.context.quotedCurrency ?? '';
  const title = notificationType === 'DISCOUNT_REQUEST' ? '💬 درخواست تخفیف'
    : notificationType === 'CONSULTATION_REQUEST' ? '📞 درخواست مشاوره / تماس'
    : notificationType === 'HOT_LEAD' ? '🔥 Hot Lead'
    : '🙋 نیاز به ورود انسان';

  const text = [
    title,
    !input.context.leadId && input.context.businessName ? `Business: ${input.context.businessName}` : '',
    input.context.countryCode || input.context.industry
      ? `Market/Industry: ${[input.context.countryCode, input.context.industry].filter(Boolean).join(' · ')}`
      : '',
    input.context.stage ? `Conversation: ${input.context.stage}` : '',
    input.context.opportunityScore != null || input.context.intentScore != null
      ? `Score: Opportunity ${input.context.opportunityScore ?? 0} · Intent ${input.context.intentScore ?? 0}`
      : '',
    serviceId ? `Service/Package: ${service?.name ?? serviceId}${service?.id ? ` [${service.id}]` : ''}` : '',
    currentPrice != null ? `Current price: ${currentPrice} ${currency}`.trim() : '',
    marketPrice ? `Rule: floor ${marketPrice.minimumPrice} · auto ≤ ${marketPrice.maxAutoDiscountPct}% · approval ≤ ${marketPrice.maxDiscountWithApprovalPct}%` : '',
    requestedPrice ? `Customer requested price/budget: ${requestedPrice}${currency ? ` ${currency}` : ''}` : '',
    requestedDiscount ? `Customer requested discount: ${requestedDiscount}` : '',
    `آخرین پیام مشتری: ${input.context.message.slice(0, 1000)}`,
    persianSummary ? `خلاصه فارسی: ${persianSummary.slice(0, 900)}` : '',
    persianIntent ? `Intent: ${persianIntent.slice(0, 300)}` : '',
    reasons ? `Reason: ${reasons}` : notificationType === 'HOT_LEAD' ? 'Reason: canonical conversation stage is HOT' : '',
    `Decision: ${input.trace.decision.action}`,
    `Next action: ${nextAction(notificationType)}`,
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
      serviceId: serviceId ?? null,
      currentPrice: currentPrice ?? null,
      currency: currency || null,
      requestedPrice: requestedPrice || null,
      requestedDiscount: requestedDiscount || null,
      outboundTriggered: false,
    },
  };
}
