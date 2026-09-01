import { describe, expect, it } from 'vitest';
import type { AgentContext, PipelineTrace } from '@/lib/agents/contracts';
import { confirmationKeyboard } from '@/lib/telegram/client';
import { isAuthorizedTelegramOwner, verifyTelegramWebhookSecret, type TelegramRuntimeConfig } from '@/lib/telegram/config';
import { isSafeServiceOptionKey } from '@/lib/telegram/commands';
import { MUTATING_COMMANDS } from '@/lib/telegram/contracts';
import { normalizeCountryCode, parseTelegramOwnerCommand } from '@/lib/telegram/parser';
import { formatLeadNotificationContext, normalizeWhatsAppLink } from '@/lib/telegram/notifications';
import { buildSalesTelegramAlert, classifySalesTelegramAlert } from '@/lib/telegram/sales-alerts';

const config: TelegramRuntimeConfig = {
  botToken: 'bot-token',
  webhookSecret: 'webhook-secret',
  ownerUserId: '123',
  ownerChatId: '456',
  organizationId: '00000000-0000-0000-0000-000000000001',
};

describe('Telegram owner assistant safety boundaries', () => {
  it('normalizes supported country aliases without guessing unknown markets', () => {
    expect(normalizeCountryCode('عمان')).toBe('OM');
    expect(normalizeCountryCode('UAE')).toBe('AE');
    expect(normalizeCountryCode('uk')).toBe('GB');
    expect(normalizeCountryCode('ZZZ')).toBeUndefined();
  });

  it('keeps pricing questions read-only and requires explicit mutation language for changes', () => {
    expect(parseTelegramOwnerCommand('قیمت عمان رو نشون بده').type).toBe('SHOW_PRICING');
    expect(parseTelegramOwnerCommand('/pricing OM')).toEqual({ type: 'SHOW_PRICING', countryCode: 'OM', serviceQuery: undefined });

    expect(parseTelegramOwnerCommand('/price OM business_website 189')).toEqual({
      type: 'SET_PRICE',
      countryCode: 'OM',
      serviceQuery: 'business_website',
      price: 189,
    });
    expect(parseTelegramOwnerCommand('قیمت business website در عمان رو 199 کن')).toEqual({
      type: 'SET_PRICE',
      countryCode: 'OM',
      serviceQuery: 'business website',
      price: 199,
    });
  });

  it('parses owner control commands conservatively', () => {
    expect(parseTelegramOwnerCommand('/service business_website off')).toEqual({
      type: 'SET_SERVICE_ENABLED', serviceQuery: 'business_website', enabled: false,
    });
    expect(parseTelegramOwnerCommand('/market OM on')).toEqual({ type: 'SET_MARKET_ENABLED', countryCode: 'OM', enabled: true });
    expect(parseTelegramOwnerCommand('/pause whatsapp')).toEqual({ type: 'SET_PAUSE', target: 'WHATSAPP', paused: true });
    expect(parseTelegramOwnerCommand('/resume agents')).toEqual({ type: 'SET_PAUSE', target: 'AGENTS', paused: false });
    expect(parseTelegramOwnerCommand('/hunt OM Muscat dental-clinic 5')).toEqual({
      type: 'CREATE_HUNTER_CAMPAIGN', countryCode: 'OM', city: 'Muscat', industry: 'dental-clinic', targetCount: 5,
    });
  });

  it('only accepts the owner alert self-test as an explicit slash command', () => {
    expect(parseTelegramOwnerCommand('/alerttest')).toEqual({ type: 'TEST_OWNER_ALERT' });
    expect(parseTelegramOwnerCommand('/alert_test@SmartVisionsOwnerBot')).toEqual({ type: 'TEST_OWNER_ALERT' });
    expect(parseTelegramOwnerCommand('تست هشدار').type).not.toBe('TEST_OWNER_ALERT');
  });

  it('requires both configured Telegram owner identity dimensions', () => {
    expect(isAuthorizedTelegramOwner({ userId: 123, chatId: 456 }, config)).toBe(true);
    expect(isAuthorizedTelegramOwner({ userId: 999, chatId: 456 }, config)).toBe(false);
    expect(isAuthorizedTelegramOwner({ userId: 123, chatId: 999 }, config)).toBe(false);
    expect(verifyTelegramWebhookSecret('webhook-secret', config)).toBe(true);
    expect(verifyTelegramWebhookSecret('wrong', config)).toBe(false);
    expect(verifyTelegramWebhookSecret(null, config)).toBe(false);
  });

  it('blocks sensitive service option keys from Telegram writes', () => {
    expect(isSafeServiceOptionKey('requiresCustomQuote')).toBe(true);
    expect(isSafeServiceOptionKey('productionMode')).toBe(true);
    expect(isSafeServiceOptionKey('api_key')).toBe(false);
    expect(isSafeServiceOptionKey('webhookSecret')).toBe(false);
    expect(isSafeServiceOptionKey('access-token')).toBe(false);
  });

  it('classifies every write command as mutating while keeping the alert self-test read-only', () => {
    for (const type of [
      'SET_PRICE','SET_SERVICE_ENABLED','SET_SERVICE_OPTION','CREATE_HUNTER_CAMPAIGN',
      'SET_MARKET_ENABLED','SET_PAUSE','APPROVE_MESSAGE','REJECT_MESSAGE','REVERT_LAST_CHANGE',
    ] as const) expect(MUTATING_COMMANDS.has(type)).toBe(true);
    expect(MUTATING_COMMANDS.has('SHOW_STATUS')).toBe(false);
    expect(MUTATING_COMMANDS.has('TEST_OWNER_ALERT')).toBe(false);
  });

  it('builds safe WhatsApp links and compact confirmation callback payloads', () => {
    expect(normalizeWhatsAppLink('+968 7740 2910')).toBe('https://wa.me/96877402910');
    expect(normalizeWhatsAppLink('123')).toBeNull();
    const keyboard = confirmationKeyboard('00000000-0000-0000-0000-000000000001');
    const callbacks = keyboard.inline_keyboard.flat().map((button) => button.callback_data ?? '');
    expect(callbacks).toEqual([
      'tg:ok:00000000-0000-0000-0000-000000000001',
      'tg:no:00000000-0000-0000-0000-000000000001',
    ]);
    for (const callback of callbacks) expect(Buffer.byteLength(callback, 'utf8')).toBeLessThanOrEqual(64);
  });

  it('treats canonical HOT conversation state as a first-class owner alert', () => {
    const context: AgentContext = { message: 'Sounds good', stage: 'HOT' };
    const trace: PipelineTrace = {
      routedAgents: [], agentResults: [],
      decision: { action: 'ANSWER', useDiscount: false, explainValue: true, askLowPressureCta: false, requiresHuman: false, reasons: [] },
      guardrails: [], handoffReasons: [], relevancePassed: true, delivery: 'REVIEW', catalogRecommendation: null,
    };
    expect(classifySalesTelegramAlert(trace, context)).toBe('HOT_LEAD');
  });

  it('keeps discount alerts commercially grounded and owner-only', () => {
    const context: AgentContext = {
      message: 'Can you make it 150 OMR?',
      leadId: '00000000-0000-0000-0000-000000000010',
      conversationId: '00000000-0000-0000-0000-000000000011',
      businessName: 'Example Clinic',
      countryCode: 'OM',
      industry: 'dental clinic',
      stage: 'HOT',
      opportunityScore: 91,
      intentScore: 88,
      quotedService: 'business_website',
      serviceKnowledge: [{
        id: 'business_website',
        name: 'Business Website',
        marketPrice: {
          countryCode: 'OM', currency: 'OMR', price: 179, minimumPrice: 150,
          maxAutoDiscountPct: 5, maxDiscountWithApprovalPct: 15,
        },
      }],
    };
    const trace: PipelineTrace = {
      routedAgents: ['intent_discovery','secretary'],
      agentResults: [
        { agent: 'intent_discovery', confidence: 0.95, summary: '', data: { requested_price: 150 }, evidence: [], blockers: [] },
        { agent: 'secretary', confidence: 0.95, summary: '', data: { operator_persian_summary: 'مشتری قیمت پایین‌تر می‌خواهد.', operator_persian_intent: 'تخفیف' }, evidence: [], blockers: [] },
      ],
      decision: { action: 'HUMAN', serviceId: 'business_website', useDiscount: false, explainValue: true, askLowPressureCta: false, requiresHuman: true, reasons: [] },
      guardrails: [], handoffReasons: ['SPECIAL_DISCOUNT'], relevancePassed: true, delivery: 'REVIEW', catalogRecommendation: null,
    };
    const alert = buildSalesTelegramAlert({ context, trace, runId: 'run-1' });
    expect(alert?.notificationType).toBe('DISCOUNT_REQUEST');
    expect(alert?.text).toContain('Current price: 179 OMR');
    expect(alert?.text).toContain('floor 150');
    expect(alert?.text).toContain('Customer requested price/budget: 150 OMR');
    expect(alert?.text).toContain('هیچ تخفیفی خودکار اعمال نشود');
    expect(alert?.payload.outboundTriggered).toBe(false);
  });

  it('formats every important lead notification with canonical operator context', () => {
    const text = formatLeadNotificationContext('DISCOUNT_REQUEST', {
      leadId: 'lead-1',
      leadStatus: 'HOT',
      opportunityScore: 92,
      intentScore: 89,
      businessName: 'Example Clinic',
      countryCode: 'OM',
      city: 'Muscat',
      industry: 'Dental',
      phone: '+968 9999 9999',
      whatsapp: 'https://wa.me/96899999999',
      conversationId: 'conversation-1',
      conversationStage: 'HOT',
      conversationRequiresHuman: true,
      conversationSummary: 'مشتری درباره وب‌سایت و تخفیف صحبت کرده است.',
      lastCustomerMessage: 'Can you do 150 OMR?',
      serviceId: 'business_website',
      serviceName: 'Business Website',
      currency: 'OMR',
      price: 179,
      minimumPrice: 150,
      maxAutoDiscountPct: 5,
      maxDiscountWithApprovalPct: 15,
    });
    expect(text).toContain('Business: Example Clinic');
    expect(text).toContain('OM · Muscat · Dental');
    expect(text).toContain('Service/Package: Business Website [business_website]');
    expect(text).toContain('Current price / rule: 179 OMR · floor 150 · auto ≤ 5% · approval ≤ 15%');
    expect(text).toContain('خلاصه مکالمه:');
    expect(text).toContain('آخرین پیام مشتری: Can you do 150 OMR?');
    expect(text).toContain('Phone: +968 9999 9999');
    expect(text).toContain('WhatsApp: https://wa.me/96899999999');
    expect(text).toContain('Next action:');
  });
});
