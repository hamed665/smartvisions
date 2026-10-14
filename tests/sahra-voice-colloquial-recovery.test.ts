import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeAgent } from '@/lib/agents/executor-core';
import { safeVehicleQuoteClarification } from '@/lib/agents/safe-clarification';
import { eligibleUntranscribedVoiceError, untranscribedVoiceClarification } from '@/lib/whatsapp/voice-understanding-recovery';

const context = {
  message: 'كم يطلع؟',
  countryCode: 'OM',
  servingBusiness: { name: 'Sahra', countryCode: 'OM' },
  industry: 'automotive interior',
  language: 'ar-OM',
  conversationHistory: [{ direction: 'INBOUND' as const, body: 'عندكم تلبيسات للمقاعد؟' }],
  marketLocaleStyle: { countryCode: 'OM', primaryLocale: 'ar-OM', dialect: 'omani', toneProfile: 'warm_short_business' },
};

describe('Sahra colloquial and voice resilience', () => {
  it('detects everyday Oman/Gulf price language without manufacturing a price', async () => {
    for (const phrase of ['بكم يطلع؟', 'جم تسوون؟', 'شو سعره؟', 'وش سعره', 'كم يطلع تقريبا؟', 'بجم؟', 'بجم كله؟', 'جم يطلع للجام كله؟', 'كم بيطلع؟', 'شحال؟']) {
      const signal = await executeAgent('intent_discovery', { ...context, message: phrase });
      expect(signal.data).toMatchObject({ askedPrice: true });
    }
  });

  it('uses the previous upholstery topic on a short colloquial price question', () => {
    const result = safeVehicleQuoteClarification(context);
    expect(result?.draft.language).toBe('ar-OM');
    expect(result?.draft.text).toContain('الموديل وسنة الصنع');
    expect(result?.draft.text).not.toMatch(/[0-9]|ريال|OMR/);
  });

  it('understands a short Omani full-window price follow-up using only customer facts', () => {
    const continued = {
      ...context,
      message: 'بجم كله؟',
      conversationHistory: [
        { direction: 'INBOUND' as const, body: 'أبغي دودي للجامات للاندكروزر موديل ٢٠٢٢' },
        { direction: 'OUTBOUND' as const, body: 'Is your car a Nissan Patrol 2020?' },
      ],
    };
    const result = safeVehicleQuoteClarification(continued);
    expect(result?.draft.language).toBe('ar-OM');
    expect(result?.draft.text).toMatch(/Land Cruiser 2022/);
    expect(result?.draft.text).toContain('سعر تظليل كل الزجاج');
    expect(result?.draft.text).not.toMatch(/ممكن الموديل|سنة الصنع|ريال|OMR|Nissan/);
    expect(safeVehicleQuoteClarification({
      ...context, message: 'بجم؟', conversationHistory: [],
    })).toBeNull();
  });

  it('recognizes a one-word vehicle make as a context follow-up, not a price request by itself', () => {
    const result = safeVehicleQuoteClarification({
      ...context,
      message: 'تويوتا',
      conversationHistory: [{ direction: 'INBOUND' as const, body: 'كم سعر تلبيس المقاعد؟' }],
    });
    expect(result?.draft.language).toBe('ar-OM');
    expect(result?.draft.text).toContain('الموديل');
    expect(safeVehicleQuoteClarification({ ...context, message: 'تويوتا', conversationHistory: [] })).toBeNull();
  });

  it('does not revive old price context when customer asks an unrelated location question', () => {
    expect(safeVehicleQuoteClarification({
      ...context,
      message: 'وين موقعكم؟',
      conversationHistory: [{ direction: 'INBOUND', body: 'كم سعر التلبيس؟' }],
    })).toBeNull();
  });

  it('only permits an honest voice clarification on explicit unsuccessful transcription', () => {
    expect(eligibleUntranscribedVoiceError(new Error('VOICE_TRANSCRIPTION_NOT_READY:FAILED'))).toBe(true);
    for (const reason of [
      'VOICE_TENANT_PROVIDER_BINDING_MISMATCH',
      'EXPECTED_INBOUND_IS_NOT_CURRENT',
      'VOICE_CANONICAL_MEDIA_EVIDENCE_INCOMPLETE',
      'VOICE_TRANSCRIPTION_NOT_READY:PROCESSING',
      'VOICE_TRANSCRIPTION_NOT_READY:SUCCEEDED',
      'INVALID_META_ACCESS_TOKEN',
    ]) expect(eligibleUntranscribedVoiceError(new Error(reason))).toBe(false);
    const reply = untranscribedVoiceClarification('ar-OM');
    expect(reply.language).toBe('ar-OM');
    expect(reply.text).toContain('الصوتي');
    expect(reply.text).not.toMatch(/سمعت|فهمت قصدك/);
    expect(untranscribedVoiceClarification('fa').language).toBe('fa');
    expect(untranscribedVoiceClarification('en').language).toBe('en');
  });

  it('keeps transcription failure replies behind the original controlled final send gate', () => {
    const helper = fs.readFileSync(path.join(process.cwd(), 'lib/whatsapp/internal-test-live-reply.ts'), 'utf8');
    expect(helper).toContain('eligibleUntranscribedVoiceError(error)');
    expect(helper).toContain('honestVoiceClarification = untranscribedVoiceClarification(');
    expect(helper.indexOf('const evidence = await controlledInboundEvidence(')).toBeLessThan(helper.indexOf('let payload: Record<string, unknown>;'));
    expect(helper).toContain('approve_whatsapp_controlled_inbound_reply');
    expect(helper).toContain("POST as approvedSendPost");
    expect(helper).toContain('controlledShadowPilot: true');
    expect(helper).toContain('automaticRetry: false');
    expect(helper).toContain("deliveryMode: honestVoiceClarification ? 'TEXT' : policy.deliveryMode");
  });
});
