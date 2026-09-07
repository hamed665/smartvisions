import { describe, expect, it } from 'vitest';
import { deriveSalesState } from '@/lib/conversations/sales-state';
import { evaluateSalesReplyPolicy, hasReadyToStartIntent } from '@/lib/conversations/sales-behavior';
import { resolveCanonicalLeadQuote } from '@/lib/agents/canonical-quote';
import type { ConversationMemoryItem, ServiceKnowledgeSnapshot } from '@/lib/agents/contracts';

function turn(body: string, direction: 'INBOUND' | 'OUTBOUND' = 'INBOUND'): ConversationMemoryItem {
  return { body, direction, status: direction === 'INBOUND' ? 'RECEIVED' : 'SENT', senderType: direction === 'INBOUND' ? 'CUSTOMER' : 'AGENT', sourceId: `${direction}:${body}` };
}

describe('sales context boundary regressions', () => {
  it.each([
    'Your budget is 500 OMR. The date is June 23 2027. I have the brief.',
    'الموقع مسقط، والميزانية 500 OMR. التاريخ المذكور يحتاج تأكيد الفريق.',
    'بودجه شما 500 OMR است. لوکیشن مسقط را در درخواست ثبت می‌کنیم.',
  ])('allows factual summaries without treating them as repeated questions: %s', (text) => {
    const salesState = deriveSalesState({ history: [turn('My budget is 500 OMR. The shoot is in Muscat on June 23 2027')] });
    const result = evaluateSalesReplyPolicy({ context: { message: 'Yes', salesState }, draft: { text, language: 'en', generatedBy: 'secretary' } });
    expect(result.reasons.filter((r) => r.includes('QUESTION'))).toEqual([]);
    expect(result.metrics.qualificationQuestions).toEqual([]);
  });

  it.each(['Which location?', 'Where is the shoot?', 'وين التصوير؟'])('still rejects repeating known location: %s', (text) => {
    const salesState = deriveSalesState({ history: [turn('The shoot is in Muscat')] });
    expect(evaluateSalesReplyPolicy({ context: { message: 'Yes', salesState }, draft: { text, language: 'en', generatedBy: 'secretary' } }).reasons).toContain('REPEATED_KNOWN_LOCATION_QUESTION');
  });

  it('does not reinterpret a price reply as a date after an agent mentioned the date in a summary', () => {
    const state = deriveSalesState({ history: [turn('The date needs team confirmation. Would you like a quote?', 'OUTBOUND'), turn('500')] });
    expect(state.date).toBeUndefined();
  });

  it.each(['How much is it?', 'I need 12 reels', '500', 'Thank you'])('does not store a non-location answer as location: %s', (answer) => {
    expect(deriveSalesState({ history: [turn('Which location?', 'OUTBOUND'), turn(answer)] }).location).toBeUndefined();
  });

  it('separates service rejection from a positive request in the same message', () => {
    const state = deriveSalesState({ history: [turn("I don't want a website but I need SEO")] });
    expect(state.rejectedServices).toEqual(['BUSINESS_WEBSITE']);
    expect(state.selectedService).toBe('SEO');
  });

  it('preserves coordinated rejections while allowing a new explicit intent after and', () => {
    const rejected = deriveSalesState({ history: [turn("I don't want a website and SEO")] });
    expect(rejected.rejectedServices).toEqual(expect.arrayContaining(['BUSINESS_WEBSITE', 'SEO']));
    expect(rejected.selectedService).toBeUndefined();

    const switched = deriveSalesState({ history: [turn("I don't want a website and I want SEO")] });
    expect(switched.rejectedServices).toContain('BUSINESS_WEBSITE');
    expect(switched.rejectedServices).not.toContain('SEO');
    expect(switched.selectedService).toBe('SEO');
  });

  it('retains quantity and gender stated together without another question', () => {
    expect(deriveSalesState({ history: [turn('I need 2 female models')] }).deliverables).toContainEqual({ kind: 'MODEL', quantity: 2, detail: 'gender:female' });
  });

  it.each(['أريد ١٢ ريلز و ٢٠ ستوري', '۱۲ ریلز و ۲۰ استوری میخوام'])('supports local-script quantities: %s', (body) => {
    const state = deriveSalesState({ history: [turn(body)] });
    expect(state.deliverables).toEqual(expect.arrayContaining([{ kind: 'REEL', quantity: 12 }, { kind: 'STORY', quantity: 20 }]));
  });

  it.each(['2027-02-30', '2027-13-02'])('does not mark an impossible date explicit: %s', (body) => {
    expect(deriveSalesState({ history: [turn(body)] }).date?.precision).toBe('AMBIGUOUS');
  });

  it.each(["I'm not ready to start", 'We are not yet ready to start', 'أنا مو جاهز', 'شروع نکن'])('does not close a negated commitment: %s', (body) => {
    expect(hasReadyToStartIntent(body)).toBe(false);
  });

  const services: ServiceKnowledgeSnapshot[] = ['business_website', 'seo_growth'].map((id, i) => ({ id, name: id, marketPrice: { countryCode: 'OM', currency: 'OMR', price: i ? 149 : 179, minimumPrice: 0, maxAutoDiscountPct: 0, maxDiscountWithApprovalPct: 0 } }));
  it('uses the requested service rather than an old website recommendation', () => {
    expect(resolveCanonicalLeadQuote({ countryCode: 'OM', serviceKnowledge: services, selectedServiceKey: 'SEO', leadRecommendedOffer: 'business_website' })).toMatchObject({ serviceId: 'seo_growth', price: 149 });
  });
  it('does not quote the old service for an unpriced customer request or a custom brief', () => {
    expect(resolveCanonicalLeadQuote({ countryCode: 'OM', serviceKnowledge: services, selectedServiceKey: 'AI_AGENT', leadRecommendedOffer: 'business_website' })).toBeNull();
    expect(resolveCanonicalLeadQuote({ countryCode: 'OM', serviceKnowledge: services, customQuoteRequired: true, leadRecommendedOffer: 'business_website' })).toBeNull();
  });
  it.each(['149.99 OMR', '1149 OMR', '-149 OMR'])('rejects a partial match for a canonical 149 quote: %s', (text) => {
    expect(evaluateSalesReplyPolicy({ context: { message: 'What is the price?', quotedPrice: 149, quotedCurrency: 'OMR' }, draft: { text, language: 'en', generatedBy: 'secretary' } }).reasons).toContain('MISSES_CANONICAL_PRICE_ANSWER');
  });
  it.each(['149.000 OMR', '١٤٩ OMR', '۱۴۹ OMR'])('accepts exact canonical amounts including local digits: %s', (text) => {
    expect(evaluateSalesReplyPolicy({ context: { message: 'What is the price?', quotedPrice: 149, quotedCurrency: 'OMR' }, draft: { text, language: 'en', generatedBy: 'secretary' } }).passed).toBe(true);
  });
});
