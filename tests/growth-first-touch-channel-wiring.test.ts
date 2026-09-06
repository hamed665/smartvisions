import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shadowApproval = readFileSync(resolve(process.cwd(), 'lib/outreach/shadow-approval.ts'), 'utf8');

describe('growth first-touch shadow wiring', () => {
  it('checks canonical market cold-channel policy before persisting a first-touch draft', () => {
    expect(shadowApproval).toContain("input.idempotencyKey.trim().startsWith('growth-first-touch:')");
    expect(shadowApproval).toContain(".from('market_settings')");
    expect(shadowApproval).toContain('evaluateGrowthFirstTouchChannelPolicy');
    expect(shadowApproval).toContain('coldEmailEnabled: config.coldEmailEnabled === true');
    expect(shadowApproval).toContain('whatsappColdEnabled: config.whatsappColdEnabled === true');
  });

  it('requires WhatsApp template configuration to survive into canonical send context', () => {
    expect(shadowApproval).toContain('config.whatsappColdTemplateName');
    expect(shadowApproval).toContain('config.whatsappColdTemplateLanguageCode');
    expect(shadowApproval).toContain('template_name: resolvedTemplateName ?? null');
    expect(shadowApproval).toContain('template_language_code: resolvedTemplateLanguageCode ?? null');
  });
});
