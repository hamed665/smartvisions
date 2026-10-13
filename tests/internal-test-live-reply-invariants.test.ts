import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('internal live WhatsApp reply invariants', () => {
  const helper = fs.readFileSync(path.join(process.cwd(), 'lib/whatsapp/internal-test-live-reply.ts'), 'utf8');
  const webhook = fs.readFileSync(path.join(process.cwd(), 'app/api/whatsapp/webhook/route.ts'), 'utf8');

  it('keeps signed webhook ACK free of paid work and uses the durable scheduled executor', () => {
    const tick = fs.readFileSync(path.join(process.cwd(), 'app/api/operations/tick/route.ts'), 'utf8');
    expect(webhook).not.toContain('runInternalTestLiveReply');
    expect(webhook).toContain('persistWhatsAppWebhookEvents');
    expect(webhook).toContain('DURABLE_EXECUTOR_ONLY');
    expect(tick).toContain('runInternalTestLiveReply({');
    expect(tick).toContain('LIVE_TEST_FAILED_NO_AUTOMATIC_RETRY');
  });

  it('reuses the canonical Agent, channel guard and approved-send handlers in-process', () => {
    expect(helper).toContain("POST as processInboundPost");
    expect(helper).toContain("POST as approvedSendPost");
    expect(helper).toContain("POST as channelGuardPost");
    expect(helper).toContain('controlledShadowPilot: true');
    expect(helper).toContain("controlledVoiceReplyPilot: policy.deliveryMode === 'VOICE_REPLY'");
    expect(helper).toContain('deliveryMode: policy.deliveryMode');
    expect(helper).not.toContain('app.smartvisionsai.com');
    expect(helper).not.toMatch(/\bfetch\s*\(/);
  });

  it('keeps normal Shadow Mode intact and blocks replay/duplicate auto-send paths', () => {
    expect(helper).toContain('shadowModeRemainsOn: true');
    expect(helper).toContain('controlledInboundEvidence({');
    expect(helper).not.toContain('count:');
    expect(helper).toContain('AGENT_ALREADY_');
    expect(helper).toContain('CONTROLLED_DRAFT_ALREADY_EXISTS');
    expect(helper).toContain('automaticRetry: false');
    expect(helper).not.toContain("shadow_mode: false");
  });
});
