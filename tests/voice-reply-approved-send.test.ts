import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { voiceReplyReservationKey } from '@/lib/voice/reply-execution';

const approvedSend = readFileSync(
  'app/api/outreach/approved-send/route-core.ts',
  'utf8',
);
const shadowApproval = readFileSync('lib/outreach/shadow-approval.ts', 'utf8');
const execution = readFileSync('lib/voice/reply-execution.ts', 'utf8');

describe('controlled voice reply approved-send contract', () => {
  it('uses a deterministic TTS reservation key per canonical message', () => {
    expect(voiceReplyReservationKey('message-123')).toBe(
      'voice-reply:message-123:tts',
    );
  });

  it('keeps voice delivery inside the existing shadow artifact and approved-send boundary', () => {
    expect(shadowApproval).toContain("deliveryMode?: 'TEXT' | 'VOICE_REPLY'");
    expect(shadowApproval).toContain("media_type: input.deliveryMode === 'VOICE_REPLY' ? 'AUDIO' : 'TEXT'");
    expect(shadowApproval).toContain("voice_reply: input.deliveryMode === 'VOICE_REPLY'");

    expect(approvedSend).toContain('controlledVoiceReplyPilot?: boolean');
    expect(approvedSend).toContain('Controlled voice reply must use the existing controlled shadow pilot boundary');
    expect(approvedSend).toContain("message.media_type ?? '').toUpperCase() !== 'AUDIO'");
    expect(execution).toContain("provider: 'OPENAI'");
    expect(approvedSend).toContain(".eq('channel', 'AI')");
    expect(approvedSend).toContain('prepareControlledVoiceReplyAudio');
    expect(approvedSend).toContain('provider.sendAudio');
    expect(approvedSend).toContain("whatsappOperation = 'SEND_AUDIO'");
    expect(approvedSend).toContain("whatsappEventType = 'AUDIO_SENT'");
  });

  it('reuses the canonical cost ledger and fails closed on ambiguous paid-provider replay', () => {
    expect(execution).toContain("operation: 'VOICE_REPLY_TTS'");
    expect(execution).toContain("pricing_status: input.config.pricingStatus");
    expect(execution).toContain("metadata.accounting_state !== 'SETTLED'");
    expect(execution).toContain('VOICE_REPLY_PROVIDER_RECONCILIATION_REQUIRED');
    expect(execution).toContain('VOICE_REPLY_MEDIA_RECONCILIATION_REQUIRED');
    expect(execution).toContain('meta_media_id: uploaded.mediaId');
    expect(execution).toContain("state: 'SETTLED'");
    expect(execution).not.toContain("state: 'RELEASED'");
  });

  it('does not introduce telephony or voice cloning through the send path', () => {
    expect(approvedSend).not.toContain('voiceCloningEnabled: true');
    expect(approvedSend).not.toContain('telephonyEnabled: true');
    expect(approvedSend).not.toContain('SIP');
  });
});
