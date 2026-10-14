/**
 * A transcript must exist before answering a customer's voice intent.
 * When verified canonical voice media cannot be transcribed, this narrow
 * recovery asks for text instead. It never guesses the contents of the audio.
 *
 * The caller still requires the same inbound evidence, trial scope, Shadow
 * approval, canonical final send gate, DNC/human handoff and 24h window.
 */
export function eligibleUntranscribedVoiceError(error: unknown) {
  const reason = error instanceof Error ? error.message : '';
  return /^VOICE_TRANSCRIPTION_NOT_READY:(?:FAILED|ERROR|UNAVAILABLE|REJECTED|NOT_SUPPORTED|TRANSIENT_FAILURE|PROVIDER_ERROR)(?:$|:)/i.test(reason);
}

export function untranscribedVoiceClarification(knownLanguage?: string): { text: string; language: string } {
  const language = String(knownLanguage ?? '').toLowerCase();
  if (language.startsWith('fa')) return {
    language: 'fa',
    text: 'ببخشید، نتونستم پیام صوتی رو به متن قابل‌اعتماد تبدیل کنم. ممکنه درخواستتون رو کوتاه بنویسید؟',
  };
  if (language.startsWith('en')) return {
    language: 'en',
    text: "Sorry, I couldn't get a reliable transcript of your voice message. Could you type what you need briefly?",
  };
  return {
    language: 'ar-OM',
    text: 'السموحة، ما قدرت أحوّل المقطع الصوتي لكلام واضح. ممكن تكتب لي طلبك باختصار؟',
  };
}
