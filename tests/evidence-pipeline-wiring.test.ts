import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(resolve(process.cwd(), 'app/api/operations/evidence-pipeline/route.ts'), 'utf8');
const worker = readFileSync(resolve(process.cwd(), 'worker/index.ts'), 'utf8');

describe('controlled evidence pipeline wiring', () => {
  it('requires the active Oman daily target plus Shadow safety before work', () => {
    expect(route).toContain("contains('config', { dailyOutreachTarget: true, targetDate: omanDay.dateKey, marketCode: 'OM' })");
    expect(route).toContain('controls.global_kill_switch || controls.agents_paused || !controls.shadow_mode');
    expect(route).toContain('DAILY_WEBSITE_AUDIT_CAP_REACHED');
    expect(route).toContain('SHADOW_DRAFT_CAP_REQUIRED');
    expect(route).toContain('DAILY_SHADOW_DRAFT_CAP_REACHED');
    expect(route).toContain(".like('provider_message_id', 'shadow:growth-first-touch:%')");
  });

  it('uses deterministic first-party evidence and never calls an LLM or provider sender', () => {
    expect(route).toContain('fetchDeterministicWebsiteEvidence');
    expect(route).toContain('selectFirstPartyContactEmail');
    expect(route).toContain('providerCalls: 0');
    expect(route).toContain('llmCalls: 0');
    expect(route).toContain('providerSendTriggered: false');
    expect(route).not.toContain('OPENAI_API_KEY');
    expect(route).not.toContain('sendWhatsApp');
    expect(route).not.toContain('sendEmail');
  });

  it('can only queue an email Shadow first touch within reconciled mailbox capacity', () => {
    expect(route).toContain("channel: 'EMAIL'");
    expect(route).toContain('queueShadowDraft');
    expect(route).toContain('countMailboxSendsLast24Hours');
    expect(route).toContain('mailboxSentLast24Hours');
    expect(route).not.toContain('mailbox.sent_today');
    expect(route).toContain('mailboxRemaining > 0');
    expect(route).toContain('marketConfig.coldEmailEnabled === true');
    expect(route).toContain('MAILBOX_DAILY_CAPACITY_RESERVED');
  });

  it('runs deterministic evidence before paid pilot acquisition on the cron', () => {
    const evidenceIndex = worker.indexOf('evidencePipelinePost(');
    const pilotIndex = worker.indexOf('pilotAcquisitionPost(');
    expect(evidenceIndex).toBeGreaterThan(0);
    expect(pilotIndex).toBeGreaterThan(evidenceIndex);
  });
});
