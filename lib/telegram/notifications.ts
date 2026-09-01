import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getTelegramRuntimeConfig } from './config';
import { sendTelegramMessage } from './client';
import type { TelegramNotificationType } from './contracts';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for Telegram notifications');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const clip = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);
const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;

export function normalizeWhatsAppLink(raw: unknown) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (/^https:\/\/wa\.me\//i.test(text) || /^https:\/\/api\.whatsapp\.com\//i.test(text)) return text;
  const digits = text.replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

type LeadNotificationContext = {
  leadId: string;
  leadStatus: string;
  opportunityScore: number;
  intentScore: number;
  businessName: string;
  countryCode: string;
  city: string;
  industry: string;
  phone: string;
  whatsapp: string | null;
  conversationId: string;
  conversationStage: string;
  conversationRequiresHuman: boolean;
  conversationSummary: string;
  lastCustomerMessage: string;
  serviceId: string;
  serviceName: string;
  currency: string;
  price: number | null;
  minimumPrice: number | null;
  maxAutoDiscountPct: number | null;
  maxDiscountWithApprovalPct: number | null;
};

async function loadLeadNotificationContext(input: {
  supabase: SupabaseClient;
  organizationId: string;
  leadId: string;
}): Promise<LeadNotificationContext> {
  const { data: lead, error: leadError } = await input.supabase
    .from('leads')
    .select('id,status,opportunity_score,intent_score,recommended_offer,business_id')
    .eq('organization_id', input.organizationId)
    .eq('id', input.leadId)
    .maybeSingle();
  if (leadError) throw new Error(`Telegram lead lookup failed: ${leadError.message}`);
  if (!lead) throw new Error('Telegram lead context is unavailable');

  const [businessResult, conversationResult, inboundResult] = await Promise.all([
    lead.business_id
      ? input.supabase.from('businesses')
        .select('id,name,city,country_code,category,whatsapp,international_phone,phone')
        .eq('organization_id', input.organizationId)
        .eq('id', lead.business_id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.supabase.from('sales_conversations')
      .select('id,persian_summary,summary,stage,requires_human,awaiting_party,stage_reason,intent_label,sentiment_label,channel')
      .eq('organization_id', input.organizationId)
      .eq('lead_id', input.leadId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    input.supabase.from('outreach_messages')
      .select('body,channel,received_at,created_at')
      .eq('organization_id', input.organizationId)
      .eq('lead_id', input.leadId)
      .eq('direction', 'INBOUND')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const firstError = [businessResult.error, conversationResult.error, inboundResult.error].find(Boolean);
  if (firstError) throw new Error(`Telegram lead context lookup failed: ${firstError!.message}`);

  const business = businessResult.data;
  const conversation = conversationResult.data;
  const inbound = inboundResult.data;
  const serviceId = clip(lead.recommended_offer, 120);
  let service: { id?: string; name?: string } | null = null;
  let price: {
    currency?: string;
    price?: unknown;
    minimum_price?: unknown;
    max_auto_discount_pct?: unknown;
    max_discount_with_approval_pct?: unknown;
  } | null = null;

  if (serviceId) {
    const [serviceResult, priceResult] = await Promise.all([
      input.supabase.from('services')
        .select('id,name')
        .eq('organization_id', input.organizationId)
        .eq('id', serviceId)
        .maybeSingle(),
      business?.country_code
        ? input.supabase.from('service_prices')
          .select('currency,price,minimum_price,max_auto_discount_pct,max_discount_with_approval_pct')
          .eq('organization_id', input.organizationId)
          .eq('service_id', serviceId)
          .eq('country_code', String(business.country_code).toUpperCase())
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (serviceResult.error) throw new Error(`Telegram service lookup failed: ${serviceResult.error.message}`);
    if (priceResult.error) throw new Error(`Telegram pricing lookup failed: ${priceResult.error.message}`);
    service = serviceResult.data;
    price = priceResult.data;
  }

  const phone = clip(business?.international_phone ?? business?.phone ?? business?.whatsapp, 80);
  const whatsapp = normalizeWhatsAppLink(business?.whatsapp ?? business?.international_phone ?? business?.phone);

  return {
    leadId: String(lead.id),
    leadStatus: clip(lead.status, 40) || 'UNKNOWN',
    opportunityScore: numeric(lead.opportunity_score) ?? 0,
    intentScore: numeric(lead.intent_score) ?? 0,
    businessName: clip(business?.name, 240) || String(lead.id),
    countryCode: clip(business?.country_code, 12),
    city: clip(business?.city, 120),
    industry: clip(business?.category, 160),
    phone,
    whatsapp,
    conversationId: clip(conversation?.id, 80),
    conversationStage: clip(conversation?.stage, 80) || 'UNKNOWN',
    conversationRequiresHuman: Boolean(conversation?.requires_human),
    conversationSummary: clip(conversation?.persian_summary ?? conversation?.summary, 850),
    lastCustomerMessage: clip(inbound?.body, 850),
    serviceId,
    serviceName: clip(service?.name, 240),
    currency: clip(price?.currency, 20),
    price: numeric(price?.price),
    minimumPrice: numeric(price?.minimum_price),
    maxAutoDiscountPct: numeric(price?.max_auto_discount_pct),
    maxDiscountWithApprovalPct: numeric(price?.max_discount_with_approval_pct),
  };
}

function importanceReason(context: LeadNotificationContext) {
  if (context.conversationRequiresHuman || context.leadStatus === 'HUMAN' || context.conversationStage === 'NEEDS_HUMAN') {
    return 'نیاز به ورود انسان دارد.';
  }
  if (context.leadStatus === 'HOT' || context.conversationStage === 'HOT') return 'Lead در وضعیت HOT است.';
  if (context.intentScore >= 80) return `Intent بالا (${context.intentScore}) دارد.`;
  if (context.opportunityScore >= 80) return `Opportunity بالا (${context.opportunityScore}) دارد.`;
  if (context.serviceId) return 'برای یک سرویس مشخص سیگنال تجاری دارد.';
  return 'Lead جدید یا به‌روزشده نیاز به بررسی دارد.';
}

function suggestedNextAction(type: TelegramNotificationType, context: LeadNotificationContext) {
  if (type === 'DISCOUNT_REQUEST') return 'قیمت و تخفیف را فقط داخل floor/approval rule بررسی و تصمیم مالک را ثبت کن.';
  if (type === 'CONSULTATION_REQUEST') return 'زمان مناسب تماس/جلسه را بررسی و هماهنگ کن.';
  if (type === 'SALES_HANDOFF') return 'مکالمه را دستی ادامه بده؛ automation نباید جای Owner پاسخ دهد.';
  if (type === 'HOT_LEAD') return 'مکالمه را سریع بررسی و next action انسانی مناسب را انتخاب کن.';
  if (context.conversationStage === 'WAITING_CUSTOMER') return 'فعلاً منتظر پاسخ مشتری بمان؛ follow-up فقط طبق policy موجود.';
  return 'Lead و آخرین پیام را مرور و کوچک‌ترین next action مفید را انتخاب کن.';
}

export function formatLeadNotificationContext(type: TelegramNotificationType, context: LeadNotificationContext) {
  const location = [context.countryCode, context.city, context.industry].filter(Boolean).join(' · ');
  const service = context.serviceName
    ? `${context.serviceName}${context.serviceId ? ` [${context.serviceId}]` : ''}`
    : context.serviceId || 'مشخص نشده';
  const pricing = context.price == null
    ? 'قیمت canonical برای این Lead/market پیدا نشد.'
    : [
      `${context.price} ${context.currency || ''}`.trim(),
      context.minimumPrice != null ? `floor ${context.minimumPrice}` : '',
      context.maxAutoDiscountPct != null ? `auto ≤ ${context.maxAutoDiscountPct}%` : '',
      context.maxDiscountWithApprovalPct != null ? `approval ≤ ${context.maxDiscountWithApprovalPct}%` : '',
    ].filter(Boolean).join(' · ');

  return [
    `Business: ${context.businessName}`,
    location ? `Country/City/Industry: ${location}` : '',
    `Score: Opportunity ${context.opportunityScore} · Intent ${context.intentScore}`,
    `دلیل اهمیت: ${importanceReason(context)}`,
    `Service/Package: ${service}`,
    `Current price / rule: ${pricing}`,
    `Conversation status: ${context.conversationStage} · Lead ${context.leadStatus}`,
    context.conversationSummary ? `خلاصه مکالمه: ${context.conversationSummary}` : 'خلاصه مکالمه: هنوز موجود نیست.',
    context.lastCustomerMessage ? `آخرین پیام مشتری: ${context.lastCustomerMessage}` : 'آخرین پیام مشتری: هنوز موجود نیست.',
    context.phone ? `Phone: ${context.phone}` : 'Phone: پیدا نشد',
    context.whatsapp ? `WhatsApp: ${context.whatsapp}` : 'WhatsApp: پیدا نشد',
    `Next action: ${suggestedNextAction(type, context)}`,
  ].filter(Boolean).join('\n');
}

export async function notifyTelegramOwner(input: {
  eventKey: string;
  notificationType: TelegramNotificationType;
  text: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  supabase?: SupabaseClient;
}) {
  const config = getTelegramRuntimeConfig();
  if (!config) return { sent: false, skipped: true, reason: 'NOT_CONFIGURED' as const };
  const supabase = input.supabase ?? serviceClient();
  const eventKey = input.eventKey.trim().slice(0, 240);
  if (!eventKey) throw new Error('Telegram notification event key is required');

  const { data: claimed, error: claimError } = await supabase.from('telegram_notification_events').insert({
    organization_id: config.organizationId,
    event_key: eventKey,
    notification_type: input.notificationType,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    payload: input.payload ?? {},
    status: 'PROCESSING',
  }).select('id').single();

  if (claimError) {
    if (claimError.code === '23505') return { sent: false, skipped: true, reason: 'DUPLICATE' as const };
    throw new Error(`Telegram notification claim failed: ${claimError.message}`);
  }

  try {
    let text = input.text.trim();
    let payload = input.payload ?? {};
    if (input.entityType === 'lead' && input.entityId) {
      const leadContext = await loadLeadNotificationContext({
        supabase,
        organizationId: config.organizationId,
        leadId: input.entityId,
      });
      text = [text, '', formatLeadNotificationContext(input.notificationType, leadContext)].filter(Boolean).join('\n');
      payload = {
        ...payload,
        leadContext: {
          leadId: leadContext.leadId,
          businessName: leadContext.businessName,
          countryCode: leadContext.countryCode,
          city: leadContext.city,
          serviceId: leadContext.serviceId || null,
          conversationId: leadContext.conversationId || null,
          whatsapp: leadContext.whatsapp,
        },
      };
    }

    const sent = await sendTelegramMessage({ chatId: config.ownerChatId, text });
    const { error: completeError } = await supabase.from('telegram_notification_events').update({
      status: 'SENT',
      telegram_message_id: sent.messageId,
      sent_at: new Date().toISOString(),
      payload,
      error: null,
    }).eq('organization_id', config.organizationId).eq('id', claimed.id).eq('status', 'PROCESSING');
    if (completeError) return { sent: true, messageId: sent.messageId, reconciliationRequired: true };
    return { sent: true, messageId: sent.messageId, reconciliationRequired: false };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : 'Telegram notification failed';
    await supabase.from('telegram_notification_events').update({ status: 'FAILED', error: message }).eq('organization_id', config.organizationId).eq('id', claimed.id).eq('status', 'PROCESSING');
    return { sent: false, skipped: false, error: message, automaticRetry: false };
  }
}

export async function notifyTelegramOwnerNewLead(input: {
  organizationId: string;
  leadId: string;
  supabase?: SupabaseClient;
}) {
  const config = getTelegramRuntimeConfig();
  if (!config || config.organizationId !== input.organizationId) return { sent: false, skipped: true, reason: 'NOT_CONFIGURED' as const };
  return notifyTelegramOwner({
    eventKey: `lead:${input.leadId}:created`,
    notificationType: 'NEW_LEAD',
    text: '🆕 لید جدید',
    entityType: 'lead',
    entityId: input.leadId,
    payload: { source: 'NEW_LEAD' },
    supabase: input.supabase,
  });
}
