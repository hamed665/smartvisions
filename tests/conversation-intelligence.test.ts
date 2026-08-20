import { describe, expect, it } from 'vitest';
import { classifyConversationStage, decideApproval, chooseReplyLanguage } from '@/lib/conversations/intelligence';
import { normalizeVoiceIntake } from '@/lib/voice/intake';

describe('conversation intelligence', () => {
  it('prioritizes closing over generic hot intent', () => {
    expect(classifyConversationStage({ closingIntent: true, intentScore: 95 }).stage).toBe('CLOSING');
  });

  it('marks pending inbound messages as unanswered', () => {
    const result = classifyConversationStage({ inboundPending: true });
    expect(result.stage).toBe('UNANSWERED');
    expect(result.priority).toBeGreaterThanOrEqual(80);
  });

  it('requires a human only for authority or risk boundaries', () => {
    expect(decideApproval({ confidence: 0.92 }).requiresApproval).toBe(false);
    expect(decideApproval({ discountBeyondAutoLimit: true }).handoff).toBe(true);
    expect(decideApproval({ complaintOrLegalRisk: true }).requiresApproval).toBe(true);
  });

  it('uses neutral Gulf Arabic when dialect confidence is weak', () => {
    const reply = chooseReplyLanguage({ detectedLanguage: 'ar', detectedDialect: 'omani', marketDialect: 'saudi', confidence: 0.5 });
    expect(reply.language).toBe('ar');
    expect(reply.dialect).toBe('saudi');
    expect(reply.useNeutralArabic).toBe(true);
  });
});

describe('voice intake', () => {
  it('keeps confident Urdu as reply language', () => {
    const result = normalizeVoiceIntake({ transcript: 'website chahiye', detectedLanguage: 'ur', confidence: 0.91 });
    expect(result.replyLanguage).toBe('ur');
    expect(result.needsLanguageReview).toBe(false);
  });

  it('flags low-confidence multilingual audio for review without forcing human commercial handoff', () => {
    const result = normalizeVoiceIntake({ transcript: 'mixed speech', detectedLanguage: 'en', confidence: 0.48 });
    expect(result.needsLanguageReview).toBe(true);
  });
});
