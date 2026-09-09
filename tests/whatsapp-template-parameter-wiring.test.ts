import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const metaCloud = readFileSync(resolve(process.cwd(), 'lib/whatsapp/meta-cloud.ts'), 'utf8');
const approvedSend = readFileSync(resolve(process.cwd(), 'app/api/outreach/approved-send/route-core.ts'), 'utf8');

describe('WhatsApp template body parameter wiring', () => {
  it('maps body parameters to Meta Cloud template components', () => {
    expect(metaCloud).toContain("type: 'body'");
    expect(metaCloud).toContain("type: 'text'");
    expect(metaCloud).toContain('input.bodyParameters');
    expect(metaCloud).toContain('components');
  });

  it('preserves queued parameters through the final approved provider send', () => {
    expect(approvedSend).toContain('template_body_parameters?: string[]');
    expect(approvedSend).toContain('bodyParameters: Array.isArray(sendContext.template_body_parameters)');
    expect(approvedSend).toContain('controlledWhatsAppOptInPilot');
    expect(approvedSend).toContain('getWhatsAppMarketingPermission');
  });
});
