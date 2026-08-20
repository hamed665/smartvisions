import { chooseReplyLanguage, type LanguageContext } from '@/lib/conversations/intelligence';

export type VoiceMedia = {
  provider: 'WHATSAPP' | 'WEB' | 'OTHER';
  providerMediaId: string;
  mimeType?: string;
  durationSeconds?: number;
  sourcePhone?: string;
};

export type TranscriptionResult = {
  transcript: string;
  detectedLanguage: string;
  detectedDialect?: string;
  confidence: number;
  segments?: Array<{ start: number; end: number; text: string }>;
};

export interface VoiceTranscriptionProvider {
  transcribe(media: VoiceMedia): Promise<TranscriptionResult>;
}

export type VoiceIntakeResult = TranscriptionResult & {
  replyLanguage: string;
  replyDialect?: string;
  useNeutralArabic: boolean;
  needsLanguageReview: boolean;
};

export function normalizeVoiceIntake(
  transcription: TranscriptionResult,
  marketDialect?: string,
): VoiceIntakeResult {
  const languageContext: LanguageContext = {
    detectedLanguage: transcription.detectedLanguage,
    detectedDialect: transcription.detectedDialect,
    marketDialect,
    confidence: transcription.confidence,
  };
  const reply = chooseReplyLanguage(languageContext);
  return {
    ...transcription,
    replyLanguage: reply.language,
    replyDialect: reply.dialect,
    useNeutralArabic: reply.useNeutralArabic,
    needsLanguageReview: transcription.confidence < 0.6,
  };
}

export function isVoiceLikeMessage(type: string) {
  return ['audio', 'voice'].includes(type.toLowerCase());
}
